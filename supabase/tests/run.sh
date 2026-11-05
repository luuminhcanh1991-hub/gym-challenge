#!/bin/bash
# Chạy toàn bộ kiểm thử trên Postgres cục bộ: PGHOST, PGPORT, PGUSER
set -e
cd "$(dirname "$0")"
psql -q -c "drop database if exists gymtest" 2>/dev/null; psql -q -c "create database gymtest"
psql -q -d gymtest -v ON_ERROR_STOP=1 -f 00_supabase_stub.sql
psql -q -d gymtest -v ON_ERROR_STOP=1 -f ../migrations/001_gym_challenge.sql 2>/dev/null
psql -q -d gymtest -v ON_ERROR_STOP=1 -f ../migrations/001_gym_challenge.sql 2>/dev/null   # chạy lại lần 2: phải an toàn
psql -q -d gymtest -f 10_rules.sql 2>&1 | grep -E 'PASS|FAIL|ERROR'
