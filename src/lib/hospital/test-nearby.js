import assert from 'node:assert/strict';
import { addressOf, nearbyHospitals, openClinics, distanceKm, fixTel } from './nearby.js';
import { mercator, naverDirections } from './directions.js';

// 공공데이터 API 대신 가짜 XML을 돌려준다 (키 없이 파싱·병합 로직만 검사)
const ok = (items) =>
  `<?xml version="1.0"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>${items}</items></body></response>`;
const LOCATIONS = ok(`
  <item><hpid>FAR</hpid><dutyName>먼병원</dutyName><dutyAddr>강원특별자치도 횡성군 횡성읍 1</dutyAddr><dutyTel1>033-000-0001</dutyTel1><latitude>37.49</latitude><longitude>127.98</longitude></item>
  <item><hpid>NEAR</hpid><dutyName>가까운병원</dutyName><dutyAddr>강원특별자치도 원주시 일산로 20</dutyAddr><dutyTel1>033-000-0002</dutyTel1><latitude>37.345</latitude><longitude>127.925</longitude></item>`);
const BEDS = {
  원주시: ok(`<item><hpid>NEAR</hpid><dutyTel3>033-000-0119</dutyTel3><hvec>-2</hvec><hv28>3</hv28><hvctayn>Y</hvctayn><hvmriayn>N</hvmriayn><hvidate>20261029223000</hvidate></item>`),
  횡성군: ok(''), // 빈 결과
};
const notice = (typ, topic, msg) => `<item><symBlkMsgTyp>${typ}</symBlkMsgTyp><symTypCodMag>${topic}</symTypCodMag><symBlkMsg>${msg}</symBlkMsg></item>`;
const NOTICES = {
  NEAR: ok(
    notice('응급', '응급실', ' NS 의료진 부재로 응급실 진료 불가 ') +
      notice('응급', '응급실', 'NS 의료진 부재로 응급실 진료 불가') + // 중복
      notice('중증', '뇌출혈수술', '불가능메세지등록') +
      notice('중증', '담낭질환', '담당의 부재'),
  ),
  FAR: ok(''),
};
const MSG_OP = 'getEmrrmSrsillDissMsgInqire';
const GATEWAY_ERROR = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>';
const calls = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  calls.push(u.pathname.split('/').pop() + (u.searchParams.get('STAGE2') ? `:${u.searchParams.get('STAGE2')}` : ''));
  if (u.pathname.endsWith(MSG_OP)) return new Response(NOTICES[u.searchParams.get('HPID')]);
  const body = u.pathname.endsWith('getEgytLcinfoInqire') ? LOCATIONS : BEDS[u.searchParams.get('STAGE2')];
  return new Response(body);
};
process.env.DATA_GO_KR_KEY = 'abc%2Bdef%3D%3D'; // Encoding 키 형태

const list = await nearbyHospitals(37.3422, 127.9202);
assert.deepEqual(list.map((h) => h.id), ['NEAR', 'FAR'], '거리순 정렬');
assert.deepEqual(calls.sort(), ['getEgytLcinfoInqire', 'getEmrrmRltmUsefulSckbdInfoInqire:원주시', 'getEmrrmRltmUsefulSckbdInfoInqire:횡성군', MSG_OP, MSG_OP]);
assert.deepEqual(list[0].notices, ['NS 의료진 부재로 응급실 진료 불가', '뇌출혈수술: 수용 불가', '담낭질환: 담당의 부재']);
assert.deepEqual(list[1].notices, [], '제한이 없는 병원');
assert.equal(list[0].tel, '033-000-0119', '응급실 직통 번호 우선');
assert.equal(list[0].erBeds, -2);
assert.equal(list[0].ct, 'Y');
assert.equal(list[1].erBeds, null, '병상 정보 없는 병원');
assert.equal(list[0].pedBeds, 3);
assert.equal(list[1].pedBeds, null, '소아 병상을 보고하지 않는 병원');
assert.equal(list[1].tel, '033-000-0001');

// Encoding 키는 한 번만 인코딩되어 나간다
globalThis.fetch = async (url) => {
  assert.equal(new URL(url).searchParams.get('serviceKey'), 'abc+def==');
  return new Response(ok(''));
};
assert.deepEqual(await nearbyHospitals(37.3, 127.9), []);

// 게이트웨이 오류 형식은 메시지와 함께 실패
globalThis.fetch = async () => new Response(GATEWAY_ERROR);
await assert.rejects(nearbyHospitals(37.3, 127.9), /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);

// 진료 제한 메시지만 실패하면 목록은 살리고, 제한 없음([])과 구별되게 null을 준다
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname.endsWith(MSG_OP)) return new Response(GATEWAY_ERROR);
  return new Response(u.pathname.endsWith('getEgytLcinfoInqire') ? LOCATIONS : ok(''));
};
const failed = await nearbyHospitals(37.3422, 127.9202);
assert.equal(failed.length, 2);
assert.ok(failed.every((h) => h.notices === null));

// 위도 1도 ≈ 111.2km
assert.ok(Math.abs(distanceKm(37, 127.9, 38, 127.9) - 111.2) < 0.1);

// 병상 정보가 없는 병원은 더 가까워도 뒤로 간다
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.pathname.endsWith('getEgytLcinfoInqire')) return new Response(LOCATIONS);
  return new Response(ok(u.searchParams.get('STAGE2') === '횡성군' ? '<item><hpid>FAR</hpid><hvec>3</hvec></item>' : ''));
};
assert.deepEqual((await nearbyHospitals(37.3422, 127.9202)).map((h) => h.id), ['FAR', 'NEAR']);

// 전국대표번호 앞 지역번호만 떼고, 일반 번호는 그대로 둔다 (실제 데이터에 있는 형식들)
assert.equal(fixTel('031-1577-8588'), '1577-8588');
assert.equal(fixTel('02-1588-5700'), '1588-5700');
assert.equal(fixTel('0215881511'), '15881511');
for (const t of ['033-741-0114', '0318285000', '061690-6000', '061544-7933', '1800-3114']) assert.equal(fixTel(t), t);
assert.equal(fixTel(undefined), undefined);

// Web Mercator 경계값: 경도 180도, 위도 85.0511도가 각각 20037508.34m
const [mx, my] = mercator(85.0511287798, 180);
assert.ok(Math.abs(mx - 20037508.34) < 1 && Math.abs(my - 20037508.34) < 1);

// 네이버 길찾기: PC는 웹 지도, Android는 앱 + 웹 지도 대체, iOS는 앱
const HOSP = { name: '가까운 병원', lat: 37.345, lon: 127.925 };
const POS = { lat: 37.3422, lon: 127.9202 };
const link = (pos, ua) => naverDirections(HOSP, pos, ua, 'https://app.test');
const name = encodeURIComponent(HOSP.name);

const pc = link(POS, 'Windows NT 10.0');
assert.match(pc.href, new RegExp(`^https://map\\.naver\\.com/p/directions/[\\d.]+,[\\d.]+,${encodeURIComponent('내 위치')}/[\\d.]+,[\\d.]+,${name}/-/car$`));
assert.equal(pc.newTab, true);
assert.match(link(null, 'Windows NT 10.0').href, /\/p\/directions\/-\/[\d.]+,/, '위치를 모르면 웹 지도 출발지는 비운다');

const android = link(POS, 'Linux; Android 14');
assert.ok(android.href.startsWith(`intent://route/car?slat=37.3422&slng=127.9202&sname=${encodeURIComponent('내 위치')}&dlat=37.345&dlng=127.925&dname=${name}&appname=https%3A%2F%2Fapp.test#Intent;`));
assert.ok(android.href.includes('package=com.nhn.android.nmap'));
assert.ok(android.href.includes(`S.browser_fallback_url=${encodeURIComponent(pc.href)};end`));
assert.equal(android.newTab, false);

const ios = link(null, 'iPhone; CPU iPhone OS 18');
assert.ok(ios.href.startsWith('nmap://route/car?dlat=37.345'), '위치를 모르면 앱이 현재 위치에서 출발한다');
assert.ok(ios.fallback.startsWith('https://map.naver.com/p/directions/-/'));

// 지금 진료 중인 병·의원: 기관 종류와 진료과목으로 거른다 (실제로 강남 상위권은 미용 위주 의원)
const clinic = (id, kind) =>
  `<item><hpid>${id}</hpid><dutyName>${id}</dutyName><dutyDivName>${kind}</dutyDivName><dutyTel1>031-1577-0000</dutyTel1><latitude>37.345</latitude><longitude>127.925</longitude><startTime>0900</startTime><endTime>2100</endTime></item>`;
const CLINIC_DEPTS = { BEAUTY: '피부과,성형외과', INTERNAL: '내과,정형외과', KIDS: '소아청소년과,이비인후과', ORTHO: '정형외과' };
globalThis.fetch = async (url) => {
  const u = new URL(url);
  assert.ok(u.pathname.includes('HsptlAsembySearchService'));
  if (u.pathname.endsWith('getHsptlMdcncLcinfoInqire')) {
    return new Response(ok(clinic('BEAUTY', '의원') + clinic('DENTAL', '치과의원') + clinic('HERB', '한방병원') + clinic('INTERNAL', '의원') + clinic('KIDS', '의원') + clinic('ORTHO', '병원')));
  }
  return new Response(ok(`<item><dgidIdName>${CLINIC_DEPTS[u.searchParams.get('HPID')]}</dgidIdName></item>`));
};
const clinicIds = async (patient) => (await openClinics(37.3422, 127.9202, patient)).map((c) => c.id);
assert.deepEqual(await clinicIds({ pediatric: false, department: '소화기내과' }), ['INTERNAL'], '일반 진료과');
assert.deepEqual(await clinicIds({ pediatric: false, department: '정형외과' }), ['INTERNAL', 'ORTHO'], '판정이 추천한 과도 포함');
assert.deepEqual(await clinicIds({ pediatric: true, department: '응급의학과' }), ['KIDS'], '소아는 소아청소년과만');
const [firstClinic] = await openClinics(37.3422, 127.9202, { pediatric: true, department: '' });
assert.equal(firstClinic.tel, '1577-0000');
assert.equal(firstClinic.opens, '0900');
assert.deepEqual(firstClinic.departments, ['소아청소년과', '이비인후과']);

// 주소는 한국식 순서로 뒤집고 우편번호·국가를 뺀다. 바다처럼 주소가 없으면 null
globalThis.fetch = async () =>
  Response.json({ display_name: '강원영서권역응급의료정보센터, 20, 일산로, 원동, 원주시, 강원특별자치도, 26426, 대한민국', address: { postcode: '26426', country: '대한민국' } });
assert.equal(await addressOf(37.3, 127.9), '강원특별자치도 원주시 원동 일산로 20 강원영서권역응급의료정보센터');
globalThis.fetch = async () => Response.json({ error: 'Unable to geocode' });
assert.equal(await addressOf(0, 0), null);

console.log('nearby 검사 통과');
