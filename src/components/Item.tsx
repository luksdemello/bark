import { memo, forwardRef } from "react";
import { ClipboardItem } from "../types";
import { formatTime, getDisplayType } from "../utils";
import { ClipboardIcon, CopyIcon, DeleteIcon, PinIcon } from "./Icons";

interface Props {
  item: ClipboardItem;
  onCopy: (id: number) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  isCopied: boolean;
  isSelected: boolean;
}

export const ClipboardListItem = memo(forwardRef<HTMLDivElement, Props>(
  ({ item, onCopy, onDelete, onPin, isCopied, isSelected }, ref) => {
    const type = getDisplayType(item);

    const classes = [
      "clipboard-item",
      item.pinned ? "pinned" : "",
      isCopied ? "copied" : "",
      isSelected ? "selected" : "",
    ].filter(Boolean).join(" ");

    return (
      <div className={classes} ref={ref}>
        <div className="item-icon">
          <ClipboardIcon type={type} />
        </div>

        <div className="item-content">
          {item.content_type === "image" ? (
            item.image_thumb_base64 ? (
              <img
                src={`data:image/png;base64,${item.image_thumb_base64}`}
                className="item-image"
                alt="Thumbnail"
              />
            ) : (
              <div className="item-row">
                <span className="item-text">[Imagem]</span>
                <span className="item-time">{formatTime(item.created_at)}</span>
              </div>
            )
          ) : (
            <div className="item-row">
              <span className="item-text">{item.text_content}</span>
              <span className="item-time">{formatTime(item.created_at)}</span>
            </div>
          )}
        </div>

        <div className="item-actions">
          <button
            onClick={() => onPin(item.id)}
            className={`action-btn pin-btn${item.pinned ? " pinned-active" : ""}`}
            title={item.pinned ? "Desafixar" : "Fixar"}
          >
            <PinIcon filled={item.pinned} />
          </button>
          <button
            onClick={() => onCopy(item.id)}
            className="action-btn copy-btn"
            title="Copiar"
          >
            <CopyIcon />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="action-btn delete-btn"
            title="Deletar"
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
    );
  }
));