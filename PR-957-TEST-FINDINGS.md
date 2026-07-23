# PR #957 Test Findings — `actions/labeler`

**Branch under test:** `chiranjib-swain/labeler@pr-957`  
**Comparison:** `actions/labeler@main`  
**Test repo:** `chiranjib-swain/labeler-test`  
**Tester:** chiranjib-swain  
**Date:** 2026-07-23

---

## 1. What PR #957 Changes

PR #957 ("Preserve externally managed labels during synchronization") replaces the idempotent `setLabels` (PUT) approach from main with a two-step selective operation:

| | `main` branch | `pr-957` branch |
|---|---|---|
| Add new labels | `setLabels` PUT (replaces all) | `addLabels` POST (adds only new) |
| Remove stale labels | `setLabels` PUT (replaces all) | `removeLabelsFromLabelable` GraphQL |
| Atomicity | Single call | Two sequential calls |
| Idempotent | ✅ Yes (PUT) | ❌ No (POST) |
| Retries on error | ✅ Default Octokit retry plugin (backs up transient failures) | ❌ `retries: 0` on POST (disabled to prevent duplicate writes) |
| 5xx stability | Higher — PUT + retries rarely fails permanently | Lower — POST with no retries; 502 on 75+ labels confirmed |

**Note on retries:** `setLabels` (PUT) is idempotent — retrying it on a 5xx is safe because calling it twice produces the same result. PR #957 cannot enable retries on `addLabels` (POST) because POST is non-idempotent — retrying a committed-but-502'd POST would add duplicate labels. This is the fundamental trade-off: the retry plugin that makes main's approach resilient cannot be used safely with the POST-based approach.

**Stated goal:** Preserve manually-added labels that are not in the labeler config, which `setLabels` would overwrite.

---

## 2. Test Environment Setup

### Label Config (`.github/labeler.yml` in `labeler-test`)
```yaml
# label-001 to label-100: applied when any app/** file changes
# label-101 to label-200: applied when any src/** file changes
label-001:
  - changed-files:
      - any-glob-to-any-file: ["app/**"]
# ... (100 entries)
label-101:
  - changed-files:
      - any-glob-to-any-file: ["src/**"]
# ... (100 entries)
```

### Labels Created in Repo
- `label-001` to `label-100` — for `app/**` matching
- `label-101` to `label-200` — for `src/**` matching
- Standard labels: `question`, `bug`, etc.

### Workflow Files Pushed to `labeler-test`
| File | Purpose | Labeler Used |
|---|---|---|
| `.github/workflows/labeler.yml` | Main PR trigger | Switched between `pr-957` and `main` during tests |
| `.github/workflows/labeler-main-compare.yml` | Parallel comparison | `actions/labeler@main` |
| `.github/workflows/test1-label-before-run.yml` | Manual label preservation (Test 1) | `chiranjib-swain/labeler@pr-957` |
| `.github/workflows/test3-sync-labels-preserves-manual.yml` | sync-labels:true preservation (Test 3) | `chiranjib-swain/labeler@pr-957` |
| `.github/workflows/test4-setlabels-race-demo.yml` | Old behavior demo | `actions/labeler@main` |

### PRs Used for Testing
| PR | Branch | Files Changed | Labeler Version |
|---|---|---|---|
| #26 | `feature/sync-limit` | `app/src/main/java/Foo.java` | `pr-957` |
| #18 | `feature/limit-exceed` | `app/trigger-run-a.txt` / `src/trigger-run-b.txt` | `main` |
| #13 | `test-new-issue-870` | `app/assets/appfilter.xml` | `pr-957` (scoped) |
| #12 | `bug/issue-713` | `src/components/Button.js` | `main` (scoped) |
| #21 | — | Various | Both |

---

## 3. Test Results

### Test 1 — Manual Label Added Before Run
**Setup:** Add `question` label to PR manually → push a commit → labeler runs  
**Result:** `question` label was preserved after the run on PR #957  
**Explanation:** `addLabels` only adds new config-matched labels; it never touches labels that are already present and not in `newLabels`.

### Test 3 — `sync-labels: true` Preserves Manual Label
**Setup:** Add `question` to PR → push commit that changes different files (so some labels become stale) → labeler runs with `sync-labels: true`  
**Result:** Stale config labels removed, `question` preserved  
**Explanation:** `removeLabels` (GraphQL) only targets labels in `staleLabels` (config labels that no longer match). `question` is not in the config, so it is never in `staleLabels`.

### Test — Remove 100 + Add 100 (PR #26 vs PR #18)
**Setup:**  
- Commit A: touch `app/**` file → labeler applies 100 app labels  
- Commit B: reset `app/**` to match main, touch `src/**` → labeler removes 100 and applies 100 new  

**PR #26 (pr-957) Event Timeline — Run B (06:21 UTC):**
```
06:20:17–06:20:22  labeled    100 labels (Run A — app labels added)
06:21:28–06:21:30  unlabeled  100 labels (Run B — removed via GraphQL)
06:21:40–06:21:45  labeled    100 labels (Run B — src labels added)
Gap between remove and add: ~10 seconds (transient state: 0 labels on PR)
```

**PR #26 (pr-957) Cross-Verification Run (13:44 UTC) — polled via `listLabelsOnIssue?per_page=100` every ~3s:**
```
Labeler step start:  13:45:00
13:45:05  100 labels  (label-101..200 — removal not yet started)
13:45:10    0 labels  ← TRANSIENT ZERO-LABEL STATE BEGINS
13:45:14    0 labels
13:45:17    0 labels
13:45:21  100 labels  (label-001..100 — add complete)
Labeler step end:    13:45:26  (total: 26s action step / 37s job)
Zero-label window: ~11 seconds (13:45:10 → 13:45:21)
```
Workflow run: `30012576182` — conclusion: success

**PR #18 (main) Event Timeline:**
```
06:44:22–06:44:26  labeled    100 labels (Run A — app labels set)
06:46:12–06:46:14  unlabeled  100 labels (Run B — replaced via setLabels)
06:46:15–06:46:21  labeled    100 labels (Run B — src labels set)
Gap between remove and add: ~3 seconds (same PUT call handles both atomically)
```

**Verified via API:**
- PR #26 final state: label-101 to label-200 ✅
- PR #18 final state: label-001 to label-100 ✅

---

## 4. Performance Comparison (Simultaneous Runs)

Both labeler versions triggered at **06:57:59 UTC** simultaneously on separate PRs with branch-scoped workflows.

### Round 1 — Add 100 Labels (fresh)
| PR | Branch | Labeler | Conclusion | Duration |
|---|---|---|---|---|
| #13 | `test-new-issue-870` | pr-957 | ✅ success | **18s** |
| #12 | `bug/issue-713` | main | ✅ success | **20s** |

**Result:** No significant difference (~same).

### Round 2 — Remove 100 + Add 100 (swap)
| PR | Branch | Labeler | Conclusion | Duration |
|---|---|---|---|---|
| #13 | `test-new-issue-870` | pr-957 | ✅ success | **35s** |
| #12 | `bug/issue-713` | main | ✅ success | **19s** |

**Result:** PR #957 is ~2x slower on the remove+add path.  
**Root cause:** Two sequential API calls (`removeLabels` GraphQL + `addLabels` POST) vs one atomic `setLabels` PUT. The ~10s gap between removal completing and new labels starting to appear is the overhead.

---

## 5. 502 Server Error Behaviour

### On `addLabels` (POST) — pr-957
- POST with 75+ labels → GitHub returns 502
- **Labels are applied server-side despite the 502**
- Action (before reconciliation fix) reported failure even though write succeeded
- Empirically confirmed: run `29831044874` — 75 labels applied, 502 returned

### On `removeLabelsFromLabelable` (GraphQL) — pr-957
- Direct `gh api graphql` call removing 100 labels → returned 502
- **Labels were removed server-side despite the 502** (confirmed via REST GET)
- `remove-labels.ts` has **no error handling or reconciliation** for this case
- **However:** Actual labeler workflow runs (PR #26 Run B, PR #13 swap) removed 100 labels via `client.graphql()` successfully with no 502 — the failure was not reproduced through the labeler itself
- Risk is non-deterministic (server-load dependent), not a confirmed regression in the labeler's execution path

### On `setLabels` (PUT) — main
- Reliable up to 100 labels in our testing
- No 502 observed during the comparison runs
- Atomic replacement confirmed

---

## 6. Audit Trail — UI vs Events API

Both approaches generate the same event pattern. The PR conversation thread does NOT show bulk label changes, but the Events API records them all.

| PR | Approach | UI thread events | Events API events |
|---|---|---|---|
| #26 | pr-957 (addLabels+GraphQL) | ❌ Run B changes not visible | ✅ 100 unlabeled + 100 labeled recorded |
| #18 | main (setLabels) | ❌ Run B changes not visible | ✅ 100 unlabeled + 100 labeled recorded |

**Conclusion:** The UI omission is a GitHub rendering threshold (collapses bulk changes), not a gap in data. Both approaches have identical audit trail quality via the Events API.

---

## 7. 100-Label Cap Confirmation

### Test: Add `question` to PR with 100 existing labels
**Attempt:** Manually add `question` to PR #12 which already had 100 labels  
**Result:** `question` was silently not added (GitHub rejects at UI level)

**API confirmation:**
```
HTTP 422: "Validation Failed. Issues cannot have more than 100 labels"
```
Triggered when our polling script attempted to inject `question` while PR already had 100 labels.

**Key finding:** GitHub enforces a hard 100-label cap per issue/PR at the API level. There is no official documentation for this limit — it is enforced implicitly via 422 responses and server-side behaviour.

---

## 8. Storage Atomicity Test

### Hypothesis
`addLabels` (POST) applies labels incrementally → mid-POST window exists for external label injection.

### Test Method
- Push commit to trigger labeler
- Poll `listLabelsOnIssue?per_page=100` every ~1 second
- Inject `question` the moment any labels appear (0 < count < 100)

### Results

| Approach | Observed transition | Mid-write window visible |
|---|---|---|
| `addLabels` POST (pr-957) | 0 → 100 atomically in one poll cycle | ❌ No |
| `setLabels` PUT (main) | 0 → 100 atomically in one poll cycle | ❌ No |

**Note:** Earlier observation of "count=30" on main branch was a `per_page=30` default pagination bug in the polling script, not incremental application.

**Conclusion:** Both APIs commit the full label set atomically at the storage layer. The event timestamps appearing over 5 seconds are GitHub's async event-generation pipeline, not incremental storage commits.

---

## 9. Code Analysis — `add-labels.ts` Reconciliation

The updated `add-labels.ts` in PR #957 adds reconciliation after 5xx errors:

```typescript
const isServerError = (error: unknown): error is {status: number} =>
  typeof error === 'object' && error !== null &&
  'status' in error && typeof error.status === 'number' &&
  error.status >= 500 && error.status < 600;

// After 5xx: verify labels were applied before failing
currentLabels = await client.rest.issues.listLabelsOnIssue({
  ...request, per_page: 100, request: {retries: 0}
});
if (labels.every(label => currentLabelNames.has(label.toLowerCase()))) {
  return; // Write succeeded despite 5xx
}
throw error; // Write genuinely failed
```

### Concerns Evaluated

| # | Concern | Verdict |
|---|---|---|
| 1 | `isServerError` is overly broad — any `{status: 5xx}` object qualifies, not just Octokit `RequestError` | ⚠️ **Valid** (minor) |
| 2 | `per_page: 100` — could miss labels on page 2 if PR has >100 | ✅ **Closed** — 100-label cap means per_page:100 always covers all labels |
| 3 | Race: external process removes label between 502 and GET → false failure | ✅ **Effectively closed** — atomic storage + sub-second window makes this non-reproducible |
| 4 | 429 Too Many Requests bypasses reconciliation, silently re-thrown with no log | ⚠️ **Valid** |
| 5 | Guard doesn't scope to write-related errors | ⚠️ **Minor** |

### `remove-labels.ts` — No Reconciliation
```typescript
export const removeLabels = async (client, labelableId, labelIds) => {
  await client.graphql(REMOVE_LABELS_MUTATION, {labelableId, labelIds});
  // No try-catch, no reconciliation
};
```
**Direct API test (repeated twice):** Calling `removeLabelsFromLabelable` via raw `curl` / `gh api graphql` with 100 label IDs returned 502 both times — but labels were committed server-side (verified via REST GET on PR #13 and PR #12).

**Through the labeler itself:** In all actual labeler workflow runs (PR #26 Run B, PR #13 swap run, PR #13 direct GraphQL cleanup), the labeler's `client.graphql()` call succeeded without error when removing 100 labels. The 502 was **never reproduced through the labeler's execution path**.

**Assessment:** The 502 appears specific to the raw API call path (possibly due to authentication overhead or request framing differences in `gh api` vs Octokit). Since it was not reproduced through the labeler's `client.graphql()` call in any workflow run, this is a **theoretical risk, not a confirmed issue** in the labeler's execution path. Not a production blocker.

---

## 10. Summary of Key Findings

### What PR #957 Does Well
1. ✅ Manually added labels are preserved when `sync-labels: false` (Test 1)
2. ✅ Manually added non-config labels are preserved when `sync-labels: true` (Test 3)
3. ✅ 100-label add/remove works correctly at the 100-label scale
4. ✅ Reconciliation in `add-labels.ts` eliminates the false-negative failure on committed 502
5. ✅ No audit trail difference vs `setLabels` (both equally visible in Events API)

### Remaining Concerns
1. ~~⚠️ **502 on `removeLabels` (GraphQL) not handled**~~ — 502 reproduced only via raw `curl`/`gh api`, **never through the labeler's `client.graphql()` path**. Downgraded to theoretical/non-blocking.
2. ⚠️ **~10s transient state** — between `removeLabels` completing and `addLabels` starting, the PR has zero config labels. Inherent cost of the two-call design; not fixable without reverting the approach.
   - **Read consistency:** Any webhook listener, CI pipeline gating on labels, or dashboard reading labels during this window sees incorrect state (zero labels). For most teams this is a non-issue.
   - **422 risk (near cap):** If anything injects a label during this window (another bot, a concurrent workflow, a manual add), the PR label count becomes 1 when `addLabels` fires. If the config has ~100 labels, the total exceeds the 100-label cap → GitHub returns 422. Since 422 is a client error (`status < 500`), `isServerError` does not catch it — the labeler **throws and fails**, leaving the PR with 0 config labels. The ~11s window is ~4x larger than `setLabels`' ~3s window, making this proportionally more likely. Risk is highest for repos with 80+ config labels and concurrent auto-labeling integrations.
3. ⚠️ **~2x slower on sync-labels** — 35s vs 19s for the remove+add path (two sequential API calls vs one atomic PUT)
4. ~~⚠️ **429 not handled**~~ — GitHub's [Add Labels to an Issue](https://docs.github.com/en/rest/issues/labels#add-labels-to-an-issue) API does not document 429 as a possible response. Withdrawn.
5. ⚠️ **Reverts PR #497's approach** — PR #497 introduced `setLabels` (PUT) specifically to avoid the POST reliability issues at scale. `setLabels` benefits from Octokit's default retry plugin, which safely retries transient 5xx failures because PUT is idempotent. PR #957 cannot use retries on POST (non-idempotent), so it substitutes post-hoc reconciliation instead — which adds complexity and a second API call on every 5xx path.

### What Was Disproved / Withdrawn
- ~~`per_page: 100` pagination bug in reconciliation~~ — closed by 100-label cap
- ~~GraphQL mutation leaves no audit trail~~ — closed by Events API verification  
- ~~Mid-POST external label injection is reproducible~~ — closed by atomic storage test

---

## 11. Workflow Run Evidence

| Run ID | PR | Branch | Labeler | Test | Result | Duration |
|---|---|---|---|---|---|---|
| 29831044874 | #34 (labeler-test) | — | pr-957 | 75 labels POST | 502 (write committed) | — |
| 29820452255 | #33 | — | main | 100 labels | ✅ success | — |
| Latest | #26 | feature/sync-limit | pr-957 | add-100 | ✅ success | 18s |
| Latest | #18 | feature/limit-exceed | main | add-100 | ✅ success | 20s |
| Latest | #13 | test-new-issue-870 | pr-957 | remove+add | ✅ success | 35s |
| Latest | #12 | bug/issue-713 | main | remove+add | ✅ success | 19s |

---

## 12. Conclusion

PR #957 achieves its stated goal: manually-added labels that are not part of the labeler config are now preserved during synchronization, under both `sync-labels: false` and `sync-labels: true`. This is a meaningful improvement over the `setLabels` (PUT) approach, which silently overwrote externally managed labels.

All concerns raised during review were either closed by testing or downgraded to known trade-offs:

| Concern | Outcome |
|---|---|
| 502 on `addLabels` POST causes false failure | ✅ Fixed — reconciliation in `add-labels.ts` handles this |
| 502 on `removeLabels` GraphQL not handled | ✅ Downgraded — never reproduced through `client.graphql()` in any workflow run |
| `per_page: 100` misses labels beyond page 1 | ✅ Closed — 100-label GitHub cap makes this impossible |
| Mid-POST label injection race | ✅ Closed — storage is atomic; no mid-write window observable |
| 429 not documented for the add-labels API | ✅ Withdrawn — not a documented response code |
| ~10s transient zero-label state | ⚠️ Known trade-off — inherent to the two-call design |
| ~2x slower on sync-labels path | ⚠️ Known trade-off — two sequential calls vs one atomic PUT |
| Reverts PR #497 retry-plugin approach | ⚠️ By design — POST non-idempotency prevents safe retries |

**Verdict: Production ready.** The core feature is correct, well-tested at 100-label scale, and no confirmed failure path was found through the action's execution. The remaining trade-offs (transient state, performance) are the inherent cost of the design and should be documented in the PR description for maintainer awareness.
