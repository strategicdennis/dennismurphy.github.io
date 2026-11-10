# Website change verification

## Before pushing

1. Review the diff against the requested changes. Run `git diff --check` and check that the push includes only the intended commits and files.
2. Run the applicable checks and exercise the affected pages or features locally. For dashboard changes, verify the relevant counts, filters, and exports against the source data.
3. Double-check the result from the user's perspective and confirm the GitHub repository and target branch before pushing.

## After pushing

1. Confirm GitHub shows the expected commit on the target branch.
2. For a live site update, confirm the deployment for that commit succeeded, then open the affected public page and spot-check the requested change. If deployment is pending or a check fails, report that status.
