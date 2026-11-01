import { XMLParser } from 'fast-xml-parser';

// 국립중앙의료원 전국 응급의료기관 정보 조회 서비스 (공공데이터포털, XML만 제공)
const BASE = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService';
// 국립중앙의료원 전국 병·의원 찾기 서비스 (활용 신청을 따로 해야 한다)
const CLINIC_BASE = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService';
const parser = new XMLParser({ isArray: (name) => name === 'item', parseTagValue: false });

/** 공공데이터 API 한 번 호출 → item 배열 */
async function call(op, params, base = BASE) {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) throw new Error('DATA_GO_KR_KEY 가 없습니다 (.env 확인)');
  // 포털의 Encoding 키를 넣어도 두 번 인코딩되지 않게 풀어서 넘긴다 (Decoding 키에는 영향 없음)
  const qs = new URLSearchParams({ serviceKey: decodeURIComponent(key), ...params });
  const res = await fetch(`${base}/${op}?${qs}`, { signal: AbortSignal.timeout(8000) });
  const xml = parser.parse(await res.text());
  // 키·트래픽 오류는 게이트웨이가 다른 형식으로 돌려준다
  const gateway = xml.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gateway) throw new Error(`${op}: ${gateway.errMsg}`);
  const { header, body } = xml.response ?? {};
  if (header?.resultCode !== '00') throw new Error(`${op}: ${header?.resultMsg ?? `HTTP ${res.status}`}`);
  return body?.items?.item ?? [];
}

/** 두 좌표 사이 직선거리 (km). API의 distance 값은 단위가 문서에 없어서 직접 계산한다 */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** 원본에 지역번호가 붙어 온 전국대표번호(031-1577-8588, 417곳 중 16곳)에서 지역번호를 뗀다 */
export const fixTel = (t) => t?.replace(/^(?:02|0[3-6]\d)-?(1[5-9]\d{2}-?\d{4})$/, '$1');

/** 응급실 메시지는 병원이 쓴 그대로, 중증질환은 항목명을 앞에 붙인다 */
function noticeText(m) {
  const msg = m.symBlkMsg?.trim();
  if (m.symBlkMsgTyp === '응급') return msg;
  return `${m.symTypCodMag}: ${!msg || msg === '불가능메세지등록' ? '수용 불가' : msg}`;
}

/** 병원이 등록한 진료 제한 안내 (API가 지금 유효한 것만 준다). 조회에 실패하면 null: 제한이 없다는 뜻이 아니다 */
async function hospitalNotices(HPID) {
  try {
    const items = await call('getEmrrmSrsillDissMsgInqire', { HPID, pageNo: 1, numOfRows: 100 });
    return [...new Set(items.map(noticeText).filter(Boolean))];
  } catch (e) {
    console.error('[hospitals] 진료 제한 메시지 실패:', e.message);
    return null;
  }
}

/**
 * 위치에서 가까운 응급의료기관 + 응급실 실시간 가용병상 + 진료 제한 안내
 * @param {number} lat
 * @param {number} lon
 * @param {number} [limit]
 */
export async function nearbyHospitals(lat, lon, limit = 5) {
  const near = (await call('getEgytLcinfoInqire', { WGS84_LAT: lat, WGS84_LON: lon, pageNo: 1, numOfRows: 20 }))
    .map((h) => ({ ...h, km: distanceKm(lat, lon, Number(h.latitude), Number(h.longitude)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);

  // 실시간 병상은 시도·시군구 단위로만 조회된다 → 주소 앞 두 단어(예: 강원특별자치도 원주시)마다 한 번씩 부른다
  // 세종은 시군구가 없어 둘째 단어가 도로명인데, 그래도 세종 병상이 조회된다 (실제 응답으로 확인)
  const regions = [...new Set(near.map((h) => h.dutyAddr.split(' ').slice(0, 2).join(' ')))];
  const beds = new Map();
  const [results, notices] = await Promise.all([
    Promise.all(
      regions.map((r) => {
        const [STAGE1, STAGE2] = r.split(' ');
        return call('getEmrrmRltmUsefulSckbdInfoInqire', { STAGE1, STAGE2, pageNo: 1, numOfRows: 100 });
      }),
    ),
    Promise.all(near.map((h) => hospitalNotices(h.hpid))),
  ]);
  for (const b of results.flat()) beds.set(b.hpid, b);

  const list = near.map((h, i) => {
    const b = beds.get(h.hpid) ?? {};
    return {
      id: h.hpid,
      name: h.dutyName,
      address: h.dutyAddr,
      tel: fixTel(b.dutyTel3 || h.dutyTel1), // dutyTel3: 응급실 직통
      lat: Number(h.latitude),
      lon: Number(h.longitude),
      km: Math.round(h.km * 10) / 10,
      erBeds: num(b.hvec), // 응급실 가용 병상 (0 이하는 여유 없음)
      pedBeds: num(b.hv28), // 응급실 소아 병상. 포털 페이지에 설명이 없어 외부 자료로 판단한 필드, 417곳 중 97곳만 보고
      ct: b.hvctayn ?? null, // Y/N
      mri: b.hvmriayn ?? null,
      angio: b.hvangioayn ?? null,
      updatedAt: b.hvidate ?? null, // YYYYMMDDHHmmss
      notices: notices[i], // 진료 제한 안내 문장들 (null: 확인 실패)
    };
  });
  // 병상을 보고하지 않는 병원은 뒤로 보낸다 (sort는 안정 정렬이라 각 묶음 안에서는 거리순 유지)
  return list.sort((a, b) => (a.erBeds == null) - (b.erBeds == null));
}

const NOT_GENERAL = /한방|한의|치과|요양|조산|기타/; // 경증 안내에 맞지 않는 기관 종류
const GENERAL_DEPTS = ['내과', '가정의학과', '응급의학과'];

/** 환자를 볼 만한 진료과가 있는가. 소아는 소아청소년과, 성인은 일반 진료과나 판정이 추천한 과 */
function fitsPatient(depts, { pediatric, department }) {
  if (pediatric) return depts.includes('소아청소년과');
  return depts.some((d) => GENERAL_DEPTS.includes(d) || department.includes(d));
}

/**
 * 지금 진료 중인 가까운 병·의원. 위치 조회는 지금 문 연 곳만 거리순으로 돌려준다.
 * 진료과목은 거기에 없어서 기본정보로 따로 확인한다 (강남은 가까운 곳 대부분이 미용 위주 의원이다)
 * ponytail: 병원마다 한 번씩 호출해야 해서 가까운 15곳만 본다. 개발계정 한도(하루 1,000회)가 풀리면 늘린다
 * @param {number} lat
 * @param {number} lon
 * @param {{pediatric: boolean, department: string}} patient department: 판정이 추천한 진료과
 * @param {number} [limit]
 */
export async function openClinics(lat, lon, patient, limit = 5) {
  const open = await call('getHsptlMdcncLcinfoInqire', { WGS84_LAT: lat, WGS84_LON: lon, pageNo: 1, numOfRows: 40 }, CLINIC_BASE);
  const near = open.filter((h) => !NOT_GENERAL.test(h.dutyDivName)).slice(0, 15);
  const infos = await Promise.all(near.map((h) => call('getHsptlBassInfoInqire', { HPID: h.hpid, pageNo: 1, numOfRows: 1 }, CLINIC_BASE)));
  return near
    .map((h, i) => ({ h, depts: infos[i][0]?.dgidIdName?.split(',') ?? [] }))
    .filter(({ depts }) => fitsPatient(depts, patient))
    .slice(0, limit)
    .map(({ h, depts }) => ({
      id: h.hpid,
      name: h.dutyName,
      kind: h.dutyDivName,
      tel: fixTel(h.dutyTel1),
      lat: Number(h.latitude),
      lon: Number(h.longitude),
      km: Math.round(distanceKm(lat, lon, Number(h.latitude), Number(h.longitude)) * 10) / 10,
      opens: h.startTime, // HHmm, 오늘 진료 시작
      closes: h.endTime,
      departments: depts,
    }));
}

/**
 * 좌표 → 읽을 수 있는 주소 (OpenStreetMap Nominatim, 키 불필요). 못 찾으면 null
 * ponytail: 공개 서버는 초당 1회 제한이고 좌표가 해외로 나간다. 실서비스는 국내 지도 업체의 주소 변환 API로 교체
 */
export async function addressOf(lat, lon) {
  const qs = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'ko', lat, lon });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${qs}`, {
    headers: { 'User-Agent': 'wonju-er-triage/0.1 (capstone project)' },
    signal: AbortSignal.timeout(5000),
  });
  const { display_name: name, address } = await res.json();
  if (!name) return null;
  // "20, 일산로, 원주시, 강원특별자치도, 26426, 대한민국" → "강원특별자치도 원주시 일산로 20"
  return name
    .split(', ')
    .filter((part) => part !== address?.postcode && part !== address?.country)
    .reverse()
    .join(' ');
}
