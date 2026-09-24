#!/bin/bash
set -a
. /home/container/work/ai-chat/.env.local
set +a
export EXEC_CWD=/home/container/work
exec node /home/container/work/ai-chat/scripts/exec-server.mjs
