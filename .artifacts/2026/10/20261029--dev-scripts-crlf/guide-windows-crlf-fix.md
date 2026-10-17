# Guide: `set: Illegal option -` in docker dev scripts (Windows)

Search keywords: `Illegal option -`, `api-dev.sh`, `workers-dev.sh`, CRLF,
Windows, `pnpm docker:dev`, autocrlf.

## Symptom

`pnpm docker:dev` on Windows, and `api` / `workers` / `web` exit with:

```
infra/docker/scripts/workers-dev.sh: 5: set: Illegal option -
infra/docker/scripts/api-dev.sh: 7: set: Illegal option -
```

## Cause

Git for Windows defaults to `core.autocrlf=true`, which checks scripts out with
CRLF. The scripts are bind-mounted into Linux containers and run with dash, so
`set -e\r` fails. The repo's `.gitattributes` (`*.sh text eol=lf`) prevents this
for new checkouts. Clones made before it existed stay CRLF until re-checked-out.

## Fix for an existing clone

Commit or stash work first (`reset --hard` discards changes):

```bash
git pull
git rm --cached -r . -q
git reset --hard
```

If you cannot pull the fix yet, run `git config core.autocrlf input` first, then
the same three commands. Working inside WSL also avoids the problem.

## Check

`git ls-files --eol infra/docker/scripts/*.sh` should show `w/lf` for every
script. `w/crlf` means the checkout still needs the fix above.

Full investigation: `plan.md` in this folder.
