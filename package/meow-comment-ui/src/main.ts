import "./styles/main.scss";
import MeowComments from "./editor/editor";

export type { MeowCommentsConfig } from "./types";
export type { MeowCommentsMessages } from "./i18n";

export const init = MeowComments.init;

export default MeowComments;
