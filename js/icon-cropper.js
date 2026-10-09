/* ---------------------------------------------------------------------------
   icon-cropper.js  →  @layer v66-accounts の実装側
   アカウントアイコンの「切り抜きエディタ」。

   設計根拠:
     - 枠（正方形）に収まる部分と倍率は利用者がドラッグとスライダーで決める。
       こちらで勝手に中央切り抜きすると、顔が切れる・主題が小さくなる。
     - アップロード時に圧縮しない。原本の見た目のまま選ばせて、
       決定したあとに Canvas で切り抜き・圧縮する（指定サイズへ収める）。
     - 計算は「単位正方形」空間で行う。表示サイズに依存しないので、
       画面幅が変わっても選んだ構図が変わらない。

   パン・ズームの幾何:
     cover = max(1/iw, 1/ih)      …枠を覆う最小倍率（これ未満だと余白が出る）
     scale = cover * zoom          …実効倍率
     x, y   … 単位正方形内での画像左上の位置（x ∈ [1 - iw*scale, 0]）
     切り抜き rect（画像px） = (-x/scale, -y/scale, 1/scale, 1/scale)
--------------------------------------------------------------------------- */

function computeCoverScale(imageWidth, imageHeight) {
  if (!imageWidth || !imageHeight) return 1;
  return Math.max(1 / imageWidth, 1 / imageHeight);
}
/* 画像が枠を常に覆う範囲へパンをクランプする（单位空間）。 */
function clampPan(pan, extent) {
  if (!(extent < 0)) return 0;
  return Math.min(0, Math.max(extent, pan));
}
/* 単位正方形ぶんの可視範囲を、画像ピクセルの矩形に変換する。
   枠の外へ出ないよう、開始位置と辺の長さを画像内へクランプする。 */
function computeCropRect({ imageWidth, imageHeight, zoom = 1, x = 0, y = 0 }) {
  const scale = computeCoverScale(imageWidth, imageHeight) * Math.max(0.1, Number(zoom) || 1);
  const size = 1 / scale;
  const clampStart = (start, limit) => Math.min(Math.max(0, start), Math.max(0, limit - size));
  return {
    sx: clampStart(-x / scale, imageWidth),
    sy: clampStart(-y / scale, imageHeight),
    sw: Math.min(size, imageWidth),
    sh: Math.min(size, imageHeight)
  };
}
/* 枠を覆う最小倍率。スライダーの下限に使う。 */
function computeMinZoom() {
  return 1;
}
/* 指定倍率で画像が単位正方形の中央に来るパン位置。 */
function centerPan(imageWidth, imageHeight, zoom) {
  const scale = computeCoverScale(imageWidth, imageHeight) * Math.max(0.1, Number(zoom) || 1);
  return { x: (1 - imageWidth * scale) / 2, y: (1 - imageHeight * scale) / 2 };
}
/* 画像を読み込む（圧縮はしない）。検証だけして objectURL を返す。 */
function loadIconSource(file, onError) {
  if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    onError?.("PNG・JPEG・WebP画像を選択してください");
    return null;
  }
  if (file.size > 15 * 1024 * 1024) {
    onError?.("アイコンは15MB以下にしてください");
    return null;
  }
  let url = "";
  try {
    url = URL.createObjectURL(file);
  } catch (_) {
    onError?.("画像を読み込めませんでした");
    return null;
  }
  return url;
}
/* 決定後の切り抜き＋圧縮。指定サイズの正方形へ描いて、
   WebP→JPEG の順に規定容量まで落とす。
   sourceUrl は objectURL / dataURI のどちらでも受け付ける。 */
async function cropToIconDataUrl(image, options) {
  const opts = options || {};
  const size = opts.size || 256;
  const targetBytes = opts.targetBytes || 24 * 1024;
  const label = opts.label || "アイコン";
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) throw new Error("画像を展開できませんでした");
  const rect = computeCropRect({ imageWidth, imageHeight, zoom: opts.zoom, x: opts.x, y: opts.y });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, size, size);
  const qualities = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5];
  for (const quality of qualities) {
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (webp && /^image\/webp$/i.test(webp.type) && webp.size <= targetBytes) {
      return { data: await readBlob(webp), bytes: webp.size, width: size, height: size, mime: webp.type };
    }
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (jpeg && jpeg.size <= targetBytes) {
      return { data: await readBlob(jpeg), bytes: jpeg.size, width: size, height: size, mime: jpeg.type };
    }
  }
  throw new Error(`${label}を規定の容量（${Math.floor(targetBytes / 1024)}KB）へ収まりませんでした。拡大しすぎている可能性があります。倍率を下げて再試行してください`);
}
function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像データを読み込めませんでした"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}
/* URL（objectURL / dataURI）から画像を読み込む。圧縮はしない。 */
function loadIconImage(sourceUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を展開できませんでした"));
    image.src = sourceUrl;
  });
}
/* URL を direct 受けして切り抜きまで行う便利関数（保存側から使う）。 */
async function cropIconFromUrl(sourceUrl, transform) {
  const image = await loadIconImage(sourceUrl);
  return cropToIconDataUrl(image, transform);
}
window.LBT_iconCrop = { computeCoverScale, clampPan, centerPan, computeCropRect, computeMinZoom, loadIconSource, loadIconImage, cropToIconDataUrl: cropIconFromUrl };

/* ---------------------------------------------------------------------------
   IconCropEditor — 枠内の構図を決めるモーダル。
   ドラッグで移動、スライダー（またはホイール）で倍率。枠から image が
   はみ出すことはない（cover でクランプ）。Esc・閉じるで取消。
--------------------------------------------------------------------------- */
const ICON_CROP_STAGE_PX = 232;
const IconCropEditor = ({ open, sourceUrl, onCancel, onApply }) => {
  const stageRef = React.useRef(null);
  const imageRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const [imageSize, setImageSize] = React.useState({ w: 0, h: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [busy, setBusy] = React.useState(false);

  /* 画像が読み込めたら、枠を覆う倍率で「中央」に置く。
     左上原点のままだと最初から画像の左上隅しか見えず、
     利用者が必ず中央へ動かす作業を強いられる。 */
  React.useEffect(() => {
    if (!open || !sourceUrl) return;
    const image = new Image();
    image.onload = () => {
      const size = { w: image.naturalWidth, h: image.naturalHeight };
      setImageSize(size);
      setZoom(1);
      setPan(centerPan(size.w, size.h, 1));
    };
    image.onerror = () => toast("画像を展開できませんでした", "assertive");
    image.src = sourceUrl;
  }, [open, sourceUrl]);

  /* 倍率を変えたら、画像が枠を覆う範囲へパンを引き戻す。
     中央基点でクランプするため、拡大しても主題が真ん中に留まる。 */
  React.useEffect(() => {
    if (!imageSize.w) return;
    const centered = window.LBT_iconCrop.centerPan(imageSize.w, imageSize.h, zoom);
    const scale = window.LBT_iconCrop.computeCoverScale(imageSize.w, imageSize.h) * zoom;
    const extentX = 1 - imageSize.w * scale;
    const extentY = 1 - imageSize.h * scale;
    setPan((current) => ({
      x: window.LBT_iconCrop.clampPan(current.x, extentX),
      y: window.LBT_iconCrop.clampPan(current.y, extentY)
    }));
    void centered;
  }, [zoom, imageSize]);

  const stageScale = React.useMemo(() => {
    if (!imageSize.w) return 1;
    return window.LBT_iconCrop.computeCoverScale(imageSize.w, imageSize.h) * zoom;
  }, [imageSize, zoom]);

  const onPointerDown = (event) => {
    if (!imageSize.w) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const extentX = 1 - imageSize.w * stageScale;
    const extentY = 1 - imageSize.h * stageScale;
    setPan({
      x: window.LBT_iconCrop.clampPan(drag.originX + (event.clientX - drag.startX) / ICON_CROP_STAGE_PX, extentX),
      y: window.LBT_iconCrop.clampPan(drag.originY + (event.clientY - drag.startY) / ICON_CROP_STAGE_PX, extentY)
    });
  };
  const endDrag = (event) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };
  const onWheel = (event) => {
    if (!imageSize.w) return;
    event.preventDefault();
    setZoom((current) => Math.min(4, Math.max(1, Number((current - event.deltaY / 400).toFixed(2)))));
  };

  const apply = async () => {
    if (!imageSize.w || busy) return;
    setBusy(true);
    try {
      /* 切り抜き・圧縮は保存側（saveCroppedIcon）で行う。ここは構図だけを
         transform として渡し、保存が終わるまで busy を保つ（決定ボタンの
         「圧縮中…」表示の根拠）。エディタ自らは画像を再読み込みしない。 */
      await onApply?.({ zoom, x: pan.x, y: pan.y });
    } catch (error) {
      toast(error?.message || "アイコンを設定できませんでした", "assertive");
    } finally {
      setBusy(false);
    }
  };

  if (!open || !sourceUrl) return null;
  return React.createElement("div", {
    className: "acct-crop-overlay",
    onClick: (event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }
  },
    React.createElement("section", { className: "acct-crop-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-crop-title" },
      React.createElement("header", { className: "acct-panel-head" },
        React.createElement("div", null,
          React.createElement("div", { className: "acct-kicker", id: "acct-crop-title" }, "◈ ICON FRAME"),
          React.createElement("p", { className: "acct-lead" }, "枠に収めたい部分を動かして決めてください。ドラッグで移動、スライダーまたはホイールで拡大します。")
        ),
        React.createElement("button", { type: "button", className: "acct-close", onClick: onCancel, disabled: busy, title: "閉じる (Esc)", "aria-label": "アイコン編集を閉じる" }, React.createElement(Icon, { name: "x", size: 16 }))
      ),
      React.createElement("div", { className: "acct-crop-body" },
        React.createElement("div", {
          ref: stageRef,
          className: "acct-crop-stage",
          style: { width: ICON_CROP_STAGE_PX, height: ICON_CROP_STAGE_PX, touchAction: "none", cursor: imageSize.w ? "grab" : "default" },
          onPointerDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onWheel
        },
          imageSize.w
            ? React.createElement("img", {
              ref: imageRef,
              src: sourceUrl,
              alt: "",
              draggable: false,
              className: "acct-crop-img",
              style: {
                width: imageSize.w * stageScale * ICON_CROP_STAGE_PX,
                height: imageSize.h * stageScale * ICON_CROP_STAGE_PX,
                transform: `translate(${pan.x * ICON_CROP_STAGE_PX}px, ${pan.y * ICON_CROP_STAGE_PX}px)`
              }
            })
            : React.createElement("span", { className: "acct-crop-loading" }, "読み込み中…"),
          React.createElement("span", { className: "acct-crop-grid", "aria-hidden": "true" })
        ),
        React.createElement("div", { className: "acct-crop-side" },
          React.createElement("label", { className: "acct-crop-zoom" },
            React.createElement("span", null, "倍率"),
            React.createElement("input", {
              type: "range",
              min: 1,
              max: 4,
              step: 0.05,
              value: zoom,
              disabled: !imageSize.w,
              "aria-label": "アイコンの倍率",
              onChange: (event) => setZoom(Number(event.target.value) || 1)
            }),
            React.createElement("b", null, `${Math.round(zoom * 100)}%`)
          ),
          React.createElement("div", { className: "acct-crop-preview" },
            React.createElement("span", { className: "acct-crop-preview-label" }, "この大きさで保存されます"),
            React.createElement("span", { className: "acct-crop-preview-row" },
              React.createElement("span", { className: "acct-crop-thumb acct-crop-thumb--sm" }, React.createElement("img", { src: sourceUrl, alt: "", draggable: false, style: previewStyle(imageSize, stageScale, pan) })),
              React.createElement("span", { className: "acct-crop-thumb acct-crop-thumb--md" }, React.createElement("img", { src: sourceUrl, alt: "", draggable: false, style: previewStyle(imageSize, stageScale, pan) }))
            )
          ),
          React.createElement("p", { className: "acct-icon-row-note" }, "決定後、256px・最大24KBへ圧縮してこの端末に保存します。")
        )
      ),
      React.createElement("footer", { className: "acct-crop-foot" },
        React.createElement(Button, { size: "sm", variant: "ghost", onClick: onCancel, disabled: busy }, "キャンセル"),
        React.createElement(Button, { size: "sm", variant: "primary", icon: "check", onClick: apply, disabled: !imageSize.w || busy }, busy ? "圧縮中…" : "決定")
      )
    )
  );
};
/* 縮小プレビュー（44px / 88px）用の変形。本体と同じ比で表示する。 */
function previewStyle(imageSize, stageScale, pan) {
  if (!imageSize.w) return { display: "none" };
  return {
    width: imageSize.w * stageScale * 100 + "%",
    height: imageSize.h * stageScale * 100 + "%",
    transform: `translate(${pan.x * 100}%, ${pan.y * 100}%)`
  };
}
Object.assign(window, { IconCropEditor, LBT_ICON_CROP_STAGE_PX: ICON_CROP_STAGE_PX });
