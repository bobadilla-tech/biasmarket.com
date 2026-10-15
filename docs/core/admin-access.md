# Granting admin access

Production commands run inside the currently live blue/green API container.
Development commands use the local dev Compose stack.

## Production

Use the wrapper that ships in `infra/vps/bin/` (CD syncs it to
`/opt/biasmarket/bin/` on every deploy). There is no source checkout on the VPS;
the wrapper finds the live color and image tag for you and runs the API's own
scripts inside the live API container. Run it as `root` (`ssh root@<vps>`) or the
`deploy` user, from any directory:

```bash
/opt/biasmarket/bin/admin.sh create  you@example.com "Your Name"
/opt/biasmarket/bin/admin.sh promote you@example.com
/opt/biasmarket/bin/admin.sh revoke  you@example.com
```

Under the hood `create` and `promote` are the following, which you can also run
by hand as the `deploy` user from `/opt/biasmarket`:

```bash
color=$(cat state/current_color)
tag=$(cat state/current_sha)
IMAGE_TAG="$tag" docker compose --env-file env/shared.env exec -T "api-$color" \
  pnpm --filter api run admin:create you@example.com "Your Name"
```

> **Do not put `--` before the arguments.** pnpm passes it through, the scripts
> read `process.argv[2]` as the email, and `admin:create -- you@example.com` would
> create an admin whose email is literally `--`. (The dev shortcuts,
> `pnpm admin:create:dev <email>`, never had the `--`.) An earlier version of this
> page had it.

`admin:create` refuses to overwrite an existing account and prints the generated
password once. `admin:promote` changes an existing account's role. Both commands
must run inside the API container because the production database is private to
the Docker network.

### First admin on a fresh production database

A newly bootstrapped database has **no admin**: sellers can sign up on their
own, but admins only come from these commands. Run `admin:create` once for
yourself, copy the password it prints (it is not stored or shown again), then
sign in at `https://biasmarket.com/es/login` (or `/en/login`) and open
`https://biasmarket.com/es/admin`, which has users, stores, coupons and
inquiries. Change the password after the first login, on the account page
(`/es/account`, it has a change-password form). To make someone who
already registered an admin, use `admin:promote` with their email instead.

## Development

```bash
pnpm admin:create:dev you@example.com "Your Name"
pnpm admin:promote:dev you@example.com
```

## Seeding production data

> **Do not run `seed:base` on a real production database.** It has no production
> guard and creates `admin@biasmarket.dev` and `owner@biasmarket.dev` as
> **admins** with the published dev password, plus demo sellers with
> `seedpassword123`, which is a public backdoor. It is meant for development and
> throwaway environments. If it was ever run against production, revoke those
> accounts (see "Revoking admin access" below) and delete them.

Use the same live-color selection, but run the seed command in `api-$color`:

```bash
sudo -iu deploy bash -lc '
  cd /opt/biasmarket
  color=$(cat state/current_color)
  tag=$(cat state/current_sha)
  IMAGE_TAG="$tag" docker compose --env-file env/shared.env exec -T "api-$color" \
    pnpm --filter api run seed:base
'
```

For an additive batch, replace the final command with:

```bash
pnpm --filter api run seed:append -- --batch=<label>
```

## Revoking admin access

```bash
/opt/biasmarket/bin/admin.sh revoke user@example.com
```

That sets the account's role back to `seller` (it prints the affected row, or
`UPDATE 0` if the email doesn't exist). It runs this SQL inside the shared `db`
service, binding the email as a quoted parameter:

```sql
update "user" set role = 'seller' where email = :'email' returning email, role;
```
