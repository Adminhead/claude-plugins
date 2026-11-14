#!/usr/bin/env bash
set -euo pipefail
# ISO-8859-1 bytes, written as octal escapes so the file is not valid UTF-8.
printf 'id;name;zip;joined;balance;note\n' > contacts.csv
printf '00417;Jonas M\374ller;02134;2024-03-09;1250,50;\n' >> contacts.csv
printf '00418;\305sa \326berg;00920;2023-11-30;0,00;"paid late; see invoice"\n' >> contacts.csv
printf '00419;"Nordlicht; S\366hne";10115;2024-01-15;87,25;\n' >> contacts.csv
