#!/bin/bash
# 13. Nhiều người dùng cùng lúc: chạy sau run.sh (dùng DB gymtest)
cd "$(dirname "$0")"
Q="psql -qtA -d gymtest"
$Q -c "update test_clock set t = '2026-11-12 07:00'"
AID=$($Q -c "select id from members where name='Anh An'")
TOK=$($Q -c "set role anon; select member_login('$AID','1111')->>'token'" | tail -1)
for i in $(seq 1 12); do $Q -c "select process_penalties()" >/dev/null 2>&1 & done
for i in $(seq 1 8);  do $Q -c "set role anon; select member_checkin('$TOK')" >/dev/null 2>&1 & done
wait
DUP=$($Q -c "select count(*) from (select member_id, day from penalties group by 1,2 having count(*)>1) x")
PAY=$($Q -c "select count(*) from (select penalty_id from wallet_tx where type='penalty_payment' group by 1 having count(*)>1) x")
CHK=$($Q -c "select count(*) from attendance_log where member_id=(select id from members where name='Anh An') and day='2026-11-12'")
PEN=$($Q -c "select count(*) from penalties where day between '2026-11-09' and '2026-11-11'")
ok(){ if [ "$1" == "$2" ]; then echo "PASS  $3"; else echo "FAIL  $3 (got $1, expected $2)"; fi; }
ok "$DUP" 0 "13a 12 tiến trình tính phạt song song: không phạt trùng"
ok "$PAY" 0 "13b không trừ tiền trùng"
ok "$CHK" 1 "13c 8 lần check-in đồng thời: chỉ 1 lần được ghi"
ok "$PEN" 15 "13d 3 ngày x 5 người được phạt đúng 1 lần"
