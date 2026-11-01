// 글자를 대신하지 않고 함께 쓰는 아이콘 (Material Icons 도형). 파일을 받지 않아서 느려지지 않는다
function Icon({ d, size = 20 }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const icon = (d) =>
  function IconShape({ size }) {
    return <Icon d={d} size={size} />;
  };

export const PhoneIcon = icon('M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z');
export const RouteIcon = icon('M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7L12 2Z');
export const HospitalIcon = icon('M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-2 11h-3v3h-4v-3H7v-4h3V7h4v3h3v4Z');
export const BedIcon = icon('M7 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4Z');
export const SpeakerIcon = icon('M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4Z');
export const MicIcon = icon('M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z');
export const StopIcon = icon('M6 6h12v12H6z');
export const BodyIcon = icon('M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2Z');
