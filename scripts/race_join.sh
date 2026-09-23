#!/bin/bash

API_URL="http://localhost:8080"
ARENA_ID="arena-1"

if [ -z "$TOKEN" ]; then
    echo "Erreur : TOKEN n'est pas défini."
    echo "Exécute d'abord : export TOKEN=\"ton_token\""
    exit 1
fi

TMP_DIR=$(mktemp -d)

echo "Lancement de 60 requêtes simultanées..."

for i in $(seq 1 60); do
    (
        curl -s \
            -o "$TMP_DIR/response_$i.json" \
            -w "%{http_code}" \
            -X POST \
            "$API_URL/api/v1/arenas/$ARENA_ID/join" \
            -H "Authorization: Bearer $TOKEN" \
            > "$TMP_DIR/status_$i.txt"
    ) &
done

wait

SUCCESS=0
CONFLICT=0
OTHER=0

for i in $(seq 1 60); do
    STATUS=$(cat "$TMP_DIR/status_$i.txt")

    case "$STATUS" in
        201)
            SUCCESS=$((SUCCESS + 1))
            ;;
        409)
            CONFLICT=$((CONFLICT + 1))
            ;;
        *)
            OTHER=$((OTHER + 1))
            echo "Requête $i : HTTP $STATUS"
            cat "$TMP_DIR/response_$i.json"
            echo
            ;;
    esac
done

echo
echo "===== RESULTAT ====="
echo "201 Created : $SUCCESS"
echo "409 Conflict: $CONFLICT"
echo "Autres      : $OTHER"
echo "Total       : $((SUCCESS + CONFLICT + OTHER))"

rm -rf "$TMP_DIR"