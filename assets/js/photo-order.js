// Shared editor for existing Supabase photo arrays. Reordering never deletes Storage objects.
export function createPhotoOrderEditor(getPreview, resolveUrl) {
  let existing = [];
  let pending = [];
  let objectUrls = [];

  function clearPending() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    pending = [];
  }

  function render() {
    const target = getPreview();
    if (!target) return;
    target.replaceChildren();
    if (!existing.length && !pending.length) {
      const empty = document.createElement("span");
      empty.textContent = "No photos selected";
      target.append(empty);
      return;
    }
    existing.forEach((url, index) => {
      const card = document.createElement("div");
      card.className = "ordered-photo";
      const img = document.createElement("img");
      img.src = resolveUrl(url);
      img.alt = `Photo ${index + 1}`;
      const toolbar = document.createElement("div");
      toolbar.className = "ordered-photo__toolbar";
      const position = document.createElement("span");
      position.textContent = `#${index + 1}`;
      toolbar.append(position);
      for (const [label, direction, disabled] of [
        ["↑", -1, index === 0], ["↓", 1, index === existing.length - 1]
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ordered-photo__move";
        button.textContent = label;
        button.title = direction < 0 ? "Move photo earlier" : "Move photo later";
        button.setAttribute("aria-label", `${button.title}: photo ${index + 1}`);
        button.disabled = disabled;
        button.addEventListener("click", () => {
          const targetIndex = index + direction;
          [existing[index], existing[targetIndex]] = [existing[targetIndex], existing[index]];
          render();
        });
        toolbar.append(button);
      }
      card.append(img, toolbar);
      target.append(card);
    });
    pending.forEach((url, index) => {
      const card = document.createElement("div");
      card.className = "ordered-photo";
      const img = document.createElement("img");
      img.src = url;
      img.alt = `New photo ${index + 1}`;
      const tag = document.createElement("div");
      tag.className = "ordered-photo__toolbar";
      tag.textContent = "NEW · added at end";
      card.append(img, tag);
      target.append(card);
    });
    const hint = document.createElement("p");
    hint.className = "ordered-photo__hint";
    hint.textContent = "Use ↑ ↓ to change existing photo order. Click Save to publish the new order. Newly selected files are added at the end.";
    target.append(hint);
  }

  return {
    setExisting(urls) {
      clearPending();
      existing = [...urls];
      render();
    },
    setPending(files) {
      clearPending();
      objectUrls = Array.from(files || [], file => URL.createObjectURL(file));
      pending = [...objectUrls];
      render();
    },
    getExisting: () => [...existing],
    reset() {
      clearPending();
      existing = [];
      render();
    }
  };
}
