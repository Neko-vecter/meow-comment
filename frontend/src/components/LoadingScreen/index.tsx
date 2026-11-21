import "./LoadingScreen.css";

export function LoadingScreen({ label }: { label: string }) {
  return <main className="center-screen"><div className="loading-mark" aria-hidden="true">MC</div><p>{label}</p></main>;
}
