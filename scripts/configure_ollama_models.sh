#!/bin/sh
# Configure the system Ollama service without moving or deleting models.
set -eu

MODELS=/run/media/pumba/DataBases/Models/Ollama
DROPIN=/etc/systemd/system/ollama.service.d/models.conf

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

configuration() {
    printf '[Unit]\nRequiresMountsFor=%s\n\n[Service]\nEnvironment="OLLAMA_MODELS=%s"\n' "$MODELS" "$MODELS"
}

[ "$(id -u)" -eq 0 ] || fail "Run with: sudo sh $0"
for tool in systemctl setfacl find mkdir cat grep runuser; do
    command -v "$tool" >/dev/null 2>&1 || fail "Required command not found: $tool"
done
id ollama >/dev/null 2>&1 || fail "The ollama service user does not exist."
[ -d "$MODELS" ] || fail "Model directory does not exist: $MODELS"
systemctl cat ollama.service >/dev/null 2>&1 || fail "Ollama system service not found."

# Never overwrite a different existing override or follow an override symlink.
[ ! -L "$DROPIN" ] || fail "Refusing a symlink at $DROPIN"
if [ -e "$DROPIN" ]; then
    [ -f "$DROPIN" ] || fail "Not a regular file: $DROPIN"
    [ "$(cat "$DROPIN")" = "$(configuration)" ] ||
        fail "Different configuration already exists at $DROPIN; review it manually."
fi

printf 'Ollama will restart; active generations will be interrupted.\n'
printf 'Models will remain in place. Failed steps stop this script without rollback.\n'

setfacl -m u:ollama:--x /run/media/pumba \
    /run/media/pumba/DataBases /run/media/pumba/DataBases/Models
setfacl -R -m u:ollama:rwX "$MODELS"
find "$MODELS" -type d -exec setfacl -m d:u:ollama:rwx {} +
runuser -u ollama -- test -r "$MODELS"
runuser -u ollama -- test -w "$MODELS"
runuser -u ollama -- test -x "$MODELS"

mkdir -p /etc/systemd/system/ollama.service.d
configuration > "$DROPIN"
systemctl daemon-reload
systemctl restart ollama.service
systemctl is-active --quiet ollama.service
systemctl show ollama.service --property=Environment |
    grep -F "OLLAMA_MODELS=$MODELS" >/dev/null ||
    fail "The service environment does not contain the requested model path."

printf 'Configured model directory: %s\n' "$MODELS"
printf 'Verify the available models with: ollama list\n'
