#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${WP_PORT:=8080}"
: "${WP_URL:=http://localhost:${WP_PORT}}"
: "${ADMIN_USER:=admin}"
: "${ADMIN_PASSWORD:=adminpass}"
: "${ADMIN_EMAIL:=admin@example.com}"

COMPOSE=(docker compose -f docker-compose.yml)

wp() {
  "${COMPOSE[@]}" run --rm -T wp-cli wp "$@" < /dev/null
}

echo "==> waiting for $WP_URL/wp-json ..."
for _ in $(seq 1 60); do
  if curl -fsS "$WP_URL/wp-json" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! wp core is-installed >/dev/null 2>&1; then
  echo "==> installing WordPress"
  wp core install \
    --url="$WP_URL" \
    --title="Kizlo Test" \
    --admin_user="$ADMIN_USER" \
    --admin_password="$ADMIN_PASSWORD" \
    --admin_email="$ADMIN_EMAIL" \
    --skip-email
fi

wp rewrite structure '/%postname%/' --hard >/dev/null

echo "==> remove default WP content"
DEFAULT_POST=$(wp post list --post_type=post --name=hello-world --field=ID --posts_per_page=1 | tr -d '\r')
if [[ -n "$DEFAULT_POST" ]]; then
  wp post delete "$DEFAULT_POST" --force >/dev/null
fi
DEFAULT_PAGE=$(wp post list --post_type=page --name=sample-page --field=ID --posts_per_page=1 | tr -d '\r')
if [[ -n "$DEFAULT_PAGE" ]]; then
  wp post delete "$DEFAULT_PAGE" --force >/dev/null
fi
PRIVACY_PAGE=$(wp post list --post_type=page --name=privacy-policy --field=ID --posts_per_page=1 --post_status=any | tr -d '\r')
if [[ -n "$PRIVACY_PAGE" ]]; then
  wp post delete "$PRIVACY_PAGE" --force >/dev/null
fi

if ! wp plugin is-installed woocommerce >/dev/null 2>&1; then
  echo "==> installing WooCommerce"
  wp plugin install woocommerce --activate
elif ! wp plugin is-active woocommerce >/dev/null 2>&1; then
  wp plugin activate woocommerce
fi

if ! wp plugin is-installed contact-form-7 >/dev/null 2>&1; then
  echo "==> installing Contact Form 7"
  wp plugin install contact-form-7 --activate
elif ! wp plugin is-active contact-form-7 >/dev/null 2>&1; then
  wp plugin activate contact-form-7
fi

if [[ -n "${KIZLO_LOCAL:-}" ]]; then
  echo "==> Kizlo plugins source: local ($KIZLO_LOCAL)"
else
  echo "==> Kizlo plugins source: release ZIPs (kizlo-io/kizlo-wordpress)"
fi

install_kizlo_plugin() {
  local name="$1" tag="$2"
  if [[ -n "${KIZLO_LOCAL:-}" ]]; then
    local src="$KIZLO_LOCAL/plugins/$name"
    if [[ ! -d "$src" ]]; then
      echo "  ERROR: $src not found" >&2
      exit 1
    fi
    local wp_container
    wp_container=$("${COMPOSE[@]}" ps -q wordpress)
    "${COMPOSE[@]}" exec -T wordpress rm -rf "/var/www/html/wp-content/plugins/$name"
    docker cp "$src/." "$wp_container:/var/www/html/wp-content/plugins/$name"
    "${COMPOSE[@]}" exec -T wordpress chown -R www-data:www-data "/var/www/html/wp-content/plugins/$name"
  else
    local url="https://github.com/kizlo-io/kizlo-wordpress/releases/download/$tag/$tag.zip"
    wp plugin install "$url" --force >/dev/null
  fi
  if ! wp plugin is-active "$name" >/dev/null 2>&1; then
    wp plugin activate "$name"
  fi
}

while IFS=$'\t' read -r name tag <&3; do
  echo "  - $name @ $tag"
  install_kizlo_plugin "$name" "$tag"
done 3< <(python3 -c '
import json
d = json.load(open("plugins.json"))
for k, v in d.items():
    if k.startswith("_"):
        continue
    print(k + "\t" + v["tag"])
')

upsert_user() {
  local login="$1" email="$2" password="$3" role="$4"
  if wp user get "$login" --field=ID >/dev/null 2>&1; then
    wp user get "$login" --field=ID
  else
    wp user create "$login" "$email" \
      --role="$role" \
      --user_pass="$password" \
      --porcelain
  fi
}

echo "==> users"
ADMIN_ID=$(wp user get "$ADMIN_USER" --field=ID | tr -d '\r')
CUSTOMER_ID=""
while IFS=$'\t' read -r username email password role <&3; do
  echo "  - $username ($role)"
  uid=$(upsert_user "$username" "$email" "$password" "$role" | tr -d '\r')
  if [[ "$username" == "customer" ]]; then
    CUSTOMER_ID="$uid"
  fi
done 3< <(python3 -c '
import json
for u in json.load(open("seed/users.json")):
    print("\t".join([u["username"], u["email"], u["password"], u["role"]]))
')

if [[ -z "$CUSTOMER_ID" ]]; then
  echo "ERROR: seed/users.json must include a user with username \"customer\"" >&2
  exit 1
fi

upsert_post() {
  local slug="$1" title="$2" content="$3"
  local existing
  existing=$(wp post list --post_type=post --name="$slug" --field=ID --posts_per_page=1 | tr -d '\r')
  if [[ -z "$existing" ]]; then
    wp post create \
      --post_type=post \
      --post_status=publish \
      --post_author="$ADMIN_ID" \
      --post_title="$title" \
      --post_name="$slug" \
      --post_content="$content" \
      --porcelain
  else
    echo "$existing"
  fi
}

echo "==> posts"
while IFS=$'\t' read -r slug title content <&3; do
  echo "  - $slug"
  upsert_post "$slug" "$title" "$content" >/dev/null
done 3< <(python3 -c '
import json
for p in json.load(open("seed/posts.json")):
    print("\t".join([p["slug"], p["title"], p["content"]]))
')

echo "==> comments"
while IFS=$'\t' read -r post_slug author email content <&3; do
  post_id=$(wp post list --post_type=post --name="$post_slug" --field=ID --posts_per_page=1 | tr -d '\r')
  if [[ -z "$post_id" ]]; then
    echo "  ! skip ($post_slug not found)"
    continue
  fi
  if [[ "$(wp comment list --post_id="$post_id" --format=count | tr -d '\r')" == "0" ]]; then
    echo "  - $post_slug <- $author"
    wp comment create \
      --comment_post_ID="$post_id" \
      --comment_content="$content" \
      --comment_author="$author" \
      --comment_author_email="$email" \
      --comment_approved=1 >/dev/null
  fi
done 3< <(python3 -c '
import json
for p in json.load(open("seed/posts.json")):
    for c in p.get("comments", []):
        print("\t".join([p["slug"], c["author"], c["email"], c["content"]]))
')

upsert_product() {
  local slug="$1" name="$2" price="$3"
  local existing
  existing=$(wp post list --post_type=product --name="$slug" --field=ID --posts_per_page=1 | tr -d '\r')
  if [[ -z "$existing" ]]; then
    wp wc product create \
      --user="$ADMIN_USER" \
      --name="$name" \
      --slug="$slug" \
      --type=simple \
      --regular_price="$price" \
      --status=publish \
      --porcelain >/dev/null
  fi
}

echo "==> products"
while IFS=$'\t' read -r slug name price <&3; do
  echo "  - $slug"
  upsert_product "$slug" "$name" "$price"
done 3< <(python3 -c '
import json
for p in json.load(open("seed/products.json")):
    print("\t".join([p["slug"], p["name"], p["price"]]))
')

echo "==> coupons"
while IFS=$'\t' read -r code dtype amount <&3; do
  echo "  - $code"
  if [[ -z "$(wp post list --post_type=shop_coupon --title="$code" --field=ID --posts_per_page=1 | tr -d '\r')" ]]; then
    wp wc shop_coupon create \
      --user="$ADMIN_USER" \
      --code="$code" \
      --discount_type="$dtype" \
      --amount="$amount" >/dev/null
  fi
done 3< <(python3 -c '
import json
for c in json.load(open("seed/coupons.json")):
    print("\t".join([c["code"], c["discount_type"], c["amount"]]))
')

echo "==> CF7 form"
IFS=$'\t' read -r CF7_TITLE CF7_FORM_FILE < <(python3 -c '
import json
d = json.load(open("seed/cf7.json"))
print("\t".join([d["title"], d["form"]]))
')
CF7_FORM_ID=$(wp post list --post_type=wpcf7_contact_form --title="$CF7_TITLE" --field=ID --posts_per_page=1 | tr -d '\r')
if [[ -z "$CF7_FORM_ID" ]]; then
  FORM_B64=$(base64 < "seed/$CF7_FORM_FILE" | tr -d '\n')
  CF7_FORM_ID=$(wp eval "
\$form = WPCF7_ContactForm::get_template(['title' => '$CF7_TITLE']);
\$form->set_properties(['form' => base64_decode('$FORM_B64')]);
echo \$form->save();
" | tr -d '\r')
fi

echo "==> menu"
IFS=$'\t' read -r MENU_NAME MENU_SLUG MENU_LOCATION < <(python3 -c '
import json
m = json.load(open("seed/menu.json"))
print("\t".join([m["name"], m["slug"], m["location"]]))
')
MENU_ID=$(wp menu list --format=csv --fields=slug,term_id 2>/dev/null | awk -F, -v slug="$MENU_SLUG" '$1==slug{print $2}' | tr -d '\r')
if [[ -z "$MENU_ID" ]]; then
  MENU_ID=$(wp menu create "$MENU_NAME" --porcelain | tr -d '\r')
fi
if [[ "$(wp menu item list "$MENU_ID" --format=count | tr -d '\r')" == "0" ]]; then
  while IFS=$'\t' read -r label url <&3; do
    wp menu item add-custom "$MENU_ID" "$label" "$url" >/dev/null
  done 3< <(python3 -c '
import json
for it in json.load(open("seed/menu.json"))["items"]:
    print("\t".join([it["label"], it["url"]]))
')
fi
wp menu location assign "$MENU_ID" "$MENU_LOCATION" >/dev/null 2>&1 || true

echo "==> admin app password"
wp user application-password delete "$ADMIN_USER" --all >/dev/null 2>&1 || true
ADMIN_APP=$(wp user application-password create "$ADMIN_USER" harness --porcelain | tr -d '\r')

cat > .test-credentials.json <<EOF
{
  "url": "$WP_URL",
  "users": {
    "admin":    { "username": "$ADMIN_USER", "app_password": "$ADMIN_APP", "wpUserId": $ADMIN_ID },
    "customer": { "username": "customer", "wpUserId": $CUSTOMER_ID }
  },
  "fixtures": {
    "cf7FormId": $CF7_FORM_ID,
    "menuId": $MENU_ID
  }
}
EOF

echo "==> done; wrote $(pwd)/.test-credentials.json"
