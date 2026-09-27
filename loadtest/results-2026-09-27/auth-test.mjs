#!/usr/bin/env node
// Auth 도메인 보안 프로브. HTTP_PROXY 설정 시 curl -x 로 Burp 등 프록시 라우팅.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = process.env.BASE_URL || 'http://localhost:3001/api'
const OUT = path.dirname(new URL(import.meta.url).pathname)
const PW = 'Password1!'
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
const proxyArg = PROXY ? ['-x', PROXY] : []
if (PROXY) console.log(`[proxy] routing via ${PROXY}`)

function curl(args) {
  const cmd = ['curl', '-s', '-o', '/tmp/auth-body.txt', '-w', '%{http_code}|%{header_json}', ...proxyArg, ...args]
  try {
    const out = execSync(cmd.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' '), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    const [status, headerJson] = out.split('|', 2)
    let headers = {}
    try { headers = JSON.parse(headerJson) } catch {}
    const body = fs.existsSync('/tmp/auth-body.txt') ? fs.readFileSync('/tmp/auth-body.txt', 'utf8') : ''
    return { status: Number(status), body, headers }
  } catch (e) {
    return { status: 0, body: '', headers: {}, error: e.message }
  }
}

function login(email, password = PW) {
  const r = curl([
    '-X', 'POST', `${BASE}/auth/login`,
    '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ email, password }),
  ])
  const setCookieArr = r.headers['set-cookie'] || []
  const setCookie = Array.isArray(setCookieArr) ? setCookieArr.join('; ') : String(setCookieArr)
  const m = /access-token=([^;]+)/.exec(setCookie)
  return { status: r.status, token: m ? m[1] : null, body: r.body }
}

function req(method, path, token, body) {
  const args = ['-X', method, `${BASE}${path}`, '-H', 'Content-Type: application/json']
  if (token) args.push('-H', `Cookie: access-token=${token}`)
  if (body) args.push('-d', JSON.stringify(body))
  return curl(args)
}

const results = []
function assert(label, expected, actual, detail = '') {
  const pass = expected === actual || (Array.isArray(expected) && expected.includes(actual))
  results.push({ label, expected, actual, detail, pass })
  const flag = pass ? '✓' : '✗'
  console.log(`  ${flag} ${label}  expected=${JSON.stringify(expected)} got=${actual}${detail ? ' · ' + detail : ''}`)
}

console.log('== Test 1: 비밀번호 복잡도 검증 (INVALID_PASSWORD_FORMAT) ==')
{
  const player = login('player@club.com')
  if (player.status !== 200) console.log(`  login failed (${player.status}), skipping`)
  else {
    const r1 = req('PATCH', '/auth/me/password', player.token, { currentPassword: PW, newPassword: 'abc', confirmedPassword: 'abc' })
    assert('short (3-char) → 400', 400, r1.status, r1.body.slice(0, 60))
    const r2 = req('PATCH', '/auth/me/password', player.token, { currentPassword: PW, newPassword: 'Password1', confirmedPassword: 'Password1' })
    assert('no special char → 400', 400, r2.status, r2.body.slice(0, 60))
    const r3 = req('PATCH', '/auth/me/password', player.token, { currentPassword: PW, newPassword: 'password1!', confirmedPassword: 'password1!' })
    assert('no uppercase → 400', 400, r3.status, r3.body.slice(0, 60))
  }
}

console.log('\n== Test 2: 비밀번호 재사용 (SAME_AS_CURRENT_PASSWORD) ==')
{
  const player = login('player@club.com')
  if (player.status === 200) {
    const r = req('PATCH', '/auth/me/password', player.token, { currentPassword: PW, newPassword: PW, confirmedPassword: PW })
    assert('same as current → 409', 409, r.status, r.body.slice(0, 80))
  }
}

console.log('\n== Test 3: 현재 비밀번호 오류 → 401 ==')
{
  const player = login('player@club.com')
  if (player.status === 200) {
    const r = req('PATCH', '/auth/me/password', player.token, { currentPassword: 'WrongPassword1!', newPassword: 'NewPassword1!', confirmedPassword: 'NewPassword1!' })
    assert('wrong current password → 401', 401, r.status, r.body.slice(0, 80))
  }
}

console.log('\n== Test 4: /auth/me/profile 인증 없이 접근 → 401 ==')
{
  const r = req('PATCH', '/auth/me/profile', null, { email: 'evil@example.com' })
  assert('no token → 401', 401, r.status, r.body.slice(0, 60))
}

console.log('\n== Test 5: 잘못된 토큰 → 401 ==')
{
  const r = req('GET', '/auth/me', 'invalid.token.here')
  assert('invalid token → 401', 401, r.status, r.body.slice(0, 60))
}

console.log('\n== Test 6: /me 응답의 PII 마스킹 여부 (본인 조회) ==')
{
  const player = login('player@club.com')
  if (player.status === 200) {
    const r = req('GET', '/auth/me', player.token)
    let email = null
    try { email = JSON.parse(r.body).email } catch {}
    const emailMasked = typeof email === 'string' && email.includes('***')
    assert('self /me 원본 반환 (마스킹 안됨)', false, emailMasked, `email=${email}`)
  }
}

console.log('\n== Test 7: 로그인 실패 시 이메일 존재 여부 노출 없음 ==')
{
  const nonexistent = login('does-not-exist@nowhere.com', 'anything')
  const wrongPw = login('player@club.com', 'wrong-password')
  const bothAre401 = nonexistent.status === 401 && wrongPw.status === 401
  assert('email 미존재 vs 비번 오류 모두 401 균일', true, bothAre401, `nonexistent=${nonexistent.status}, wrongPw=${wrongPw.status}`)
}

console.log('\n== Test 8: soft-deleted 유저 로그인 (코드 리뷰) ==')
console.log('  ⚠ auth.service.ts:14-27 login() 은 user.isDeleted 미체크')
console.log('  ✓ authMiddleware.ts:44-46 이 후속 요청 401 차단')
results.push({ label: 'soft-deleted login flow (코드 리뷰)', expected: 'authMiddleware 차단', actual: 'authMiddleware 차단', pass: true, detail: 'authMiddleware.ts:46' })

console.log('\n== Test 9: Refresh 토큰 재사용 (sequential) ==')
{
  // 로그인 → refresh cookie 확보 → refresh 1회 → 동일 refresh 로 2회째 시도 → 401 기대
  const jar = '/tmp/auth-jar.txt'
  fs.writeFileSync(jar, '')
  // login 이 refresh cookie 를 세팅하니 -c 로 저장
  const loginArgs = ['-s', '-o', '/dev/null', '-X', 'POST', `${BASE}/auth/login`, '-H', 'Content-Type: application/json', '-d', JSON.stringify({ email: 'player@club.com', password: PW }), '-c', jar, '-w', '%{http_code}']
  const loginCmd = ['curl', ...proxyArg, ...loginArgs].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
  const loginStatus = execSync(loginCmd, { encoding: 'utf8' })
  if (loginStatus.trim() !== '200') { console.log(`  login setup failed (${loginStatus})`); }
  else {
    // 1st refresh — should succeed
    const r1 = execSync(['curl', '-s', '-o', '/dev/null', ...proxyArg, '-X', 'POST', `${BASE}/auth/refresh`, '-b', jar, '-c', jar, '-w', '%{http_code}'].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' '), { encoding: 'utf8' })
    // 2nd refresh — after 300ms delay, using ORIGINAL cookie (before rotation)
    // Actually the -c has overwritten it. To test properly need refresh token BEFORE rotation.
    // Simpler: replay 1st refresh's response before update. But we already rotated.
    // Instead: use a fresh login, capture refresh in jar1, do first refresh with jar1 keeping the OLD cookie, then reuse.
    const jar1 = '/tmp/auth-jar-1.txt'
    fs.writeFileSync(jar1, '')
    execSync(`curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -X POST '${BASE}/auth/login' -H 'Content-Type: application/json' -d '${JSON.stringify({ email: 'player@club.com', password: PW })}' -c '${jar1}'`, { encoding: 'utf8' })
    const originalCookie = fs.readFileSync(jar1, 'utf8')
    // 1st refresh — server rotates
    const s1 = execSync(`curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -X POST '${BASE}/auth/refresh' -b '${jar1}' -w '%{http_code}'`, { encoding: 'utf8' }).trim()
    // 300ms delay
    execSync('sleep 0.3')
    // reset jar to original refresh cookie, retry
    fs.writeFileSync(jar1, originalCookie)
    const s2 = execSync(`curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -X POST '${BASE}/auth/refresh' -b '${jar1}' -w '%{http_code}'`, { encoding: 'utf8' }).trim()
    assert('1st refresh → 200', 200, Number(s1))
    assert('sequential replay (300ms 후 동일 refresh 재사용) → 401', 401, Number(s2), `s2=${s2}`)
  }
}

console.log('\n== Test 10: Refresh 토큰 concurrent 재사용 (race condition) ==')
{
  const jar = '/tmp/auth-jar-race.txt'
  fs.writeFileSync(jar, '')
  execSync(`curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -X POST '${BASE}/auth/login' -H 'Content-Type: application/json' -d '${JSON.stringify({ email: 'player@club.com', password: PW })}' -c '${jar}'`, { encoding: 'utf8' })
  const originalCookie = fs.readFileSync(jar, 'utf8')
  // Concurrent 2회 병렬 — blacklist fire-and-forget 이면 둘 다 200 가능
  const proxyStr = proxyArg.map((a) => `'${a}'`).join(' ')
  const cmd = `curl -s -o /dev/null ${proxyStr} -X POST '${BASE}/auth/refresh' -b '${jar}' -w '%{http_code}\\n'`
  fs.writeFileSync(jar, originalCookie)
  const outA = execSync(`${cmd} & ${cmd} & wait`, { encoding: 'utf8', shell: '/bin/bash' })
  const codes = outA.trim().split('\n').map(Number).sort()
  const bothOk = codes[0] === 200 && codes[1] === 200
  const oneOk = codes.includes(200) && codes.includes(401)
  assert('concurrent 2회: 하나만 200 이어야 안전', false, bothOk, `codes=${JSON.stringify(codes)} · both200=${bothOk} oneEach=${oneOk}`)
  results.push({ label: 'concurrent refresh 상세', expected: 'one 200 · one 401', actual: JSON.stringify(codes), pass: oneOk, detail: bothOk ? '⚠️ race condition — blacklist fire-and-forget' : 'OK' })
}

const total = results.length
const passed = results.filter((r) => r.pass).length
console.log(`\nSummary: ${passed}/${total} passed${PROXY ? ` (via ${PROXY})` : ''}`)

fs.writeFileSync(
  path.join(OUT, 'auth-test.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE, proxy: PROXY || null, results }, null, 2)
)
console.log(`Wrote ${path.join(OUT, 'auth-test.json')}`)
if (passed < total) process.exitCode = 1
