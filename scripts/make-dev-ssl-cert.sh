#!/bin/bash
#
# Creates a local CA + signed server certificate for local development.
#
# The CA cert (ca.crt) has CA:TRUE so Firefox will accept it when imported
# under Authorities. The server cert (nginx.crt) is signed by that CA.
#
# Usage:
#   ./make-dev-ssl-cert.sh [common-name]
#
# After running, import .local/certs/ca.crt into Firefox:
#   about:preferences#privacy → View Certificates → Authorities → Import
#   ✓ Trust this CA to identify websites
#
# Or enable security.enterprise_roots.enabled in about:config and add
# ca.crt to the Windows Trusted Root store instead.

if [ -z "${1}" ]; then
    echo "No Common Name supplied, using \"aegis-local.fit.nasa.gov\""
    CN="aegis-local.fit.nasa.gov"
else
    CN="${1}"
fi

set -eux

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
LOCAL_DIR="${SCRIPT_DIR}/../.local"
CERTS_DIR="${LOCAL_DIR}/certs"
PRIVATE_DIR="${LOCAL_DIR}/private"

mkdir -p "${CERTS_DIR}"
mkdir -p "${PRIVATE_DIR}"

# --- 1. Create a local CA (only if it doesn't already exist) ---
if [ ! -f "${PRIVATE_DIR}/ca.key" ] || [ ! -f "${CERTS_DIR}/ca.crt" ]; then
    echo "==> Generating local CA key + certificate …"
    openssl req -x509 -new -newkey rsa:4096 -nodes \
        -keyout "${PRIVATE_DIR}/ca.key" \
        -out "${CERTS_DIR}/ca.crt" \
        -days 3650 \
        -subj "//C=US/ST=Texas/L=Houston/O=AEGIS Dev CA/CN=AEGIS Local Dev CA"
    echo "==> CA certificate created at ${CERTS_DIR}/ca.crt"
    echo "    Import this file into Firefox Authorities or the Windows Trusted Root store."
else
    echo "==> Existing CA found, reusing ${CERTS_DIR}/ca.crt"
fi

# --- 2. Generate a server key + CSR ---
echo "==> Generating server key + CSR for CN=${CN} …"
openssl req -new -newkey rsa:4096 -nodes \
    -keyout "${PRIVATE_DIR}/nginx.key" \
    -out "${CERTS_DIR}/nginx.csr" \
    -subj "//C=US/ST=Texas/L=Houston/O=NASA/CN=${CN}"

# --- 3. Create an extensions file for SAN support ---
EXT_FILE="${CERTS_DIR}/_server_ext.cnf"
cat > "${EXT_FILE}" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature, keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1 = ${CN}
DNS.2 = aegis-local.fit.nasa.gov
DNS.3 = localhost
DNS.4 = aegisnginx
IP.1  = 127.0.0.1
IP.2  = ::1
EOF

# --- 4. Sign the server cert with our CA ---
echo "==> Signing server certificate with local CA …"
openssl x509 -req \
    -in "${CERTS_DIR}/nginx.csr" \
    -CA "${CERTS_DIR}/ca.crt" \
    -CAkey "${PRIVATE_DIR}/ca.key" \
    -CAcreateserial \
    -out "${CERTS_DIR}/nginx.crt" \
    -days 825 \
    -extfile "${EXT_FILE}"

# Clean up temp files
rm -f "${CERTS_DIR}/nginx.csr" "${EXT_FILE}"

echo ""
echo "==> Done!"
echo "    CA cert  : ${CERTS_DIR}/ca.crt   (import into browser / OS trust store)"
echo "    Server cert: ${CERTS_DIR}/nginx.crt"
echo "    Server key : ${PRIVATE_DIR}/nginx.key"
echo ""
echo "Firefox quick-start:"
echo "  1. about:preferences#privacy → Certificates → View Certificates"
echo "  2. Authorities tab → Import → select ca.crt"
echo "  3. Check 'Trust this CA to identify websites' → OK"
echo ""
echo "Or: set security.enterprise_roots.enabled = true in about:config"
echo "    and import ca.crt into Windows cert store:"
echo "    certutil -addstore Root \"${CERTS_DIR}/ca.crt\""
