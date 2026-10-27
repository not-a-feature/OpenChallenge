# Maintain a derived challenge site

Keep general application fixes, dependency upgrades, and security changes in OpenChallenge.
A derived repository owns its challenge content, images, example inputs, private-reference
configuration, and deployment settings. Both repositories share Git history so that later
application updates can be merged normally.

In the derived repository, configure the template remote once:

```bash
git remote add upstream git@github.com:not-a-feature/OpenChallenge.git
```

To prepare an update:

```bash
git fetch upstream
git switch -c update-template-YYYY-MM-DD
git merge upstream/main -m "Merge OpenChallenge template updates"
```

Review changes to content, environment configuration, container setup, and references.
Run the README validation commands against the derived site's actual content, then push
the branch and open a pull request into that repository's `main` branch. GitHub's compare
page can also propose updates between repositories in the same fork network. Use a merge
commit when integrating upstream updates so that Git records which template history has
already been included.

The derived repository's Actions tab also provides a manual **Sync template** workflow.
It merges upstream changes into `update-openchallenge-template` and opens or updates a
pull request. Enable write access and pull-request creation for GitHub Actions in that
repository's Actions settings. Merge conflicts stop the workflow for manual resolution.
OpenChallenge is public, so the hosted workflow reads it without additional SSH keys
or stored personal tokens. The derived repository's built-in workflow token pushes
the update branch and creates the PR; the derived repository can remain private.
The local SSH workflow above uses the SSH identity already configured on your computer.

For a general fix discovered while working on a site, create its branch from
`upstream/main` and propose it to OpenChallenge first. This keeps challenge-specific
content out of the template. Merge the resulting template commit into derived sites.

Before deployment, back up the database and uploads, retain the current authentication
secret, review migrations, and preserve exact reference versions. A source update does
not deploy a running site automatically.
