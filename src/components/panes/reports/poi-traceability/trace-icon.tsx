import type { FunctionComponent } from "react";
import { EmojiRenderer } from "components/interface/emojis";
import styles from "./poi-traceability.module.css";

/** Keep stored emoji/custom icons separate from the report's plain text labels. */
const TraceIcon: FunctionComponent<{ icon: string | null | undefined }> = ({ icon }) =>
  icon ? (
    <span className={styles.itemIcon} aria-hidden="true">
      <EmojiRenderer iconValue={icon} />
    </span>
  ) : null;

export default TraceIcon;
