-- Team.id 는 cuid String 인데 Player.youthOriginTeamId 는 Int? 로 선언돼 있어 FK 형변환이 불가능했음.
-- promotePlayer 코드도 string teamId 를 Int 필드에 넣으려 해서 타입 에러 발생.
-- 이 컬럼은 아직 어떤 쓰기 경로에서도 성공적으로 저장된 적 없으므로 데이터 유실 위험 없음.
ALTER TABLE "Player" ALTER COLUMN "youthOriginTeamId" TYPE TEXT USING NULL;
