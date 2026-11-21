import { AlertCircle } from "lucide-react";
import "./InlineAlert.css";

export function InlineAlert({ message, tone }: { message: string; tone: "error" | "info" }) {
  return <div className={`inline-alert ${tone}`} role="alert"><AlertCircle /><span>{message}</span></div>;
}
