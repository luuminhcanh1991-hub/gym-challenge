#!/bin/bash
# Chạy toàn bộ kiểm thử trên Postgres cục bộ: PGHOST, PGPORT, PGUSER
set -e
cd "$(dirname "$0")"
psql -q -c "drop database if exists gymtest" 2>/dev/null; psql -q -c "create database gymtest"
psql -q -d gymtest -v ON_ERROR_STOP=1 -f 00_supabase_stub.sql
psql -q -d gymtest -v ON_ERROR_STOP=1 -f ../migrations/001_gym_challenge.sql 2>/dev/null
psql -q -d gymtest -v ON_ERROR_STOP=1 -f ../migrations/001_gym_challenge.sql 2>/dev/null   # chạy lại lần 2: phải an toàn
for f in ../migrations/0[0-9][0-9]_*.sql; do [ "$f" = ../migrations/001_gym_challenge.sql ] && continue; psql -q -d gymtest -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -v NOTICE || true; psql -q -d gymtest -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1; done
psql -q -d gymtest -f 10_rules.sql 2>&1 | grep -E 'PASS|FAIL|ERROR'
psql -q -d gymtest -f 30_join_recovery.sql 2>&1 | grep -E 'PASS|FAIL|ERROR'
