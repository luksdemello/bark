import { memo } from "react";
import { ClipboardItem } from "../types";
import { formatTime, getDisplayType } from "../utils";
import { ClipboardIcon, CopyIcon, DeleteIcon } from "./Icons";

interface Props {
  item: ClipboardItem;
  onCopy: (id: number) => void;
  onDelete: (id: number) => void;
}

export const ClipboardListItem = memo(({ item, onCopy, onDelete }: Props) => {
  const type = getDisplayType(item);

  return (
    <div className="clipboard-item">
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
});