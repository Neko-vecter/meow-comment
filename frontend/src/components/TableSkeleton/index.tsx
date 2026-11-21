import { useI18n } from "../../i18n";
import "./TableSkeleton.css";

export function TableSkeleton() {
  const { t } = useI18n();
  return <div className="table-skeleton" aria-label={t.loading.table}><span /><span /><span /><span /></div>;
}
