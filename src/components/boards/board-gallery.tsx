"use client";

import { useEffect, useMemo, useState } from "react";

interface BoardGalleryProps {
  brand: string;
  modelName: string;
  primaryImage: string | null | undefined;
  galleryImages?: string[] | null;
}

function normalizeImages(
  primaryImage: string | null | undefined,
  galleryImages?: string[] | null,
) {
  return Array.from(
    new Set(
      [primaryImage, ...(galleryImages ?? [])]
        .map((image) => String(image ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export function BoardGallery({
  brand,
  modelName,
  primaryImage,
  galleryImages = [],
}: BoardGalleryProps) {
  const images = useMemo(
    () => normalizeImages(primaryImage, galleryImages),
    [galleryImages, primaryImage],
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const availableImages = images.filter((image) => !failedImages.includes(image));
  const activeImage =
    selectedImage && availableImages.includes(selectedImage)
      ? selectedImage
      : availableImages[0] ?? null;

  function handleImageError(imageUrl: string) {
    setFailedImages((current) =>
      current.includes(imageUrl) ? current : [...current, imageUrl],
    );
  }

  function selectImage(imageUrl: string) {
    setSelectedImage(imageUrl);
  }

  function openViewer(imageUrl?: string) {
    if (imageUrl) {
      setSelectedImage(imageUrl);
    }

    setIsViewerOpen(true);
  }

  function closeViewer() {
    setIsViewerOpen(false);
  }

  function showNeighborImage(direction: -1 | 1) {
    if (!activeImage || availableImages.length <= 1) {
      return;
    }

    const currentIndex = availableImages.indexOf(activeImage);
    const nextIndex =
      (currentIndex + direction + availableImages.length) % availableImages.length;
    setSelectedImage(availableImages[nextIndex]);
  }

  useEffect(() => {
    if (!isViewerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeViewer();
      }

      if (event.key === "ArrowRight") {
        if (!activeImage || availableImages.length <= 1) {
          return;
        }

        const currentIndex = availableImages.indexOf(activeImage);
        const nextIndex =
          (currentIndex + 1 + availableImages.length) % availableImages.length;
        setSelectedImage(availableImages[nextIndex]);
      }

      if (event.key === "ArrowLeft") {
        if (!activeImage || availableImages.length <= 1) {
          return;
        }

        const currentIndex = availableImages.indexOf(activeImage);
        const nextIndex =
          (currentIndex - 1 + availableImages.length) % availableImages.length;
        setSelectedImage(availableImages[nextIndex]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImage, availableImages, isViewerOpen]);

  if (!activeImage) {
    return (
      <div className="panel overflow-hidden p-5 sm:p-6">
        <div className="flex min-h-[26rem] flex-col justify-between rounded-[1.4rem] border border-[var(--color-border)] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5f8_100%)] p-6">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-sky-deep)]/70">
            {brand}
          </span>
          <div className="space-y-3">
            <p className="heading-display max-w-lg text-3xl font-bold text-balance sm:text-4xl">
              {modelName}
            </p>
            <p className="max-w-md text-sm leading-7 text-[var(--color-muted)]">
              Фото для этой модели пока не подготовлены. Размерная сетка и
              параметры уже доступны, а изображения можно будет добавить позже.
            </p>
          </div>
          <div className="flex items-end justify-end">
            <div className="h-44 w-9 rounded-full bg-[linear-gradient(180deg,rgba(74,136,170,0.18),rgba(18,52,63,0.08))]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel overflow-hidden p-5 sm:p-6">
        <div className="rounded-[1.4rem] border border-[var(--color-border)] bg-[linear-gradient(180deg,#fbfdfe_0%,#eef4f7_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] sm:p-5">
          <div className="grid-fade rounded-[1.1rem] border border-[rgba(18,52,63,0.08)] bg-white p-4 shadow-[0_20px_35px_rgba(18,52,63,0.06)] sm:p-6">
            <button
              type="button"
              onClick={() => openViewer(activeImage)}
              className="group block w-full text-left"
              aria-label="Открыть фото в полном размере"
            >
              <div className="flex min-h-[22rem] items-center justify-center sm:min-h-[28rem]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={activeImage}
                  src={activeImage}
                  alt={`${brand} ${modelName}`}
                  loading="eager"
                  className="h-full max-h-[28rem] w-full object-contain"
                  onError={() => handleImageError(activeImage)}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 text-sm text-[var(--color-muted)]">
                <span>
                  {availableImages.length > 1
                    ? `Фото ${availableImages.indexOf(activeImage) + 1} из ${availableImages.length}`
                    : "Фото модели"}
                </span>
                <span className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 font-semibold text-[var(--color-pine)] group-hover:border-[var(--color-sky)]">
                  Открыть крупнее
                </span>
              </div>
            </button>
          </div>
        </div>

        {availableImages.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {availableImages.map((image, index) => {
              const isActive = image === activeImage;

              return (
                <button
                  key={image}
                  type="button"
                  onClick={() => selectImage(image)}
                  className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1rem] border bg-white p-2 shadow-[0_8px_16px_rgba(18,52,63,0.05)] ${
                    isActive
                      ? "border-[var(--color-sky)] ring-2 ring-[rgba(74,136,170,0.18)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-sky)]"
                  }`}
                  aria-label={`Показать фото ${index + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-contain"
                    onError={() => handleImageError(image)}
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {isViewerOpen ? (
        <div
          className="fixed inset-0 z-50 bg-[rgba(8,17,24,0.78)] p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${brand} ${modelName}`}
          onClick={closeViewer}
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/68">
                  {brand}
                </p>
                <p className="heading-display mt-2 text-2xl font-bold sm:text-3xl">
                  {modelName}
                </p>
              </div>

              <button
                type="button"
                onClick={closeViewer}
                className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-white/16 bg-white/8 px-4 text-sm font-bold text-white hover:bg-white/14"
              >
                Закрыть
              </button>
            </div>

            <div className="relative rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(246,250,252,0.98),rgba(232,241,246,0.98))] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.32)] sm:p-6">
              {availableImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => showNeighborImage(-1)}
                    className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/92 text-xl text-[var(--color-pine)] shadow-[0_8px_20px_rgba(18,52,63,0.12)] hover:border-[var(--color-sky)]"
                    aria-label="Предыдущее фото"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => showNeighborImage(1)}
                    className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/92 text-xl text-[var(--color-pine)] shadow-[0_8px_20px_rgba(18,52,63,0.12)] hover:border-[var(--color-sky)]"
                    aria-label="Следующее фото"
                  >
                    ›
                  </button>
                </>
              ) : null}

              <div className="flex min-h-[56vh] items-center justify-center rounded-[1.2rem] bg-white p-4 sm:p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${activeImage}-viewer`}
                  src={activeImage}
                  alt={`${brand} ${modelName}`}
                  className="h-full max-h-[72vh] w-full object-contain"
                  onError={() => handleImageError(activeImage)}
                />
              </div>
            </div>

            {availableImages.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {availableImages.map((image, index) => {
                  const isActive = image === activeImage;

                  return (
                    <button
                      key={`${image}-viewer-thumb`}
                      type="button"
                      onClick={() => selectImage(image)}
                      className={`flex h-18 w-18 items-center justify-center overflow-hidden rounded-[1rem] border p-2 ${
                        isActive
                          ? "border-white bg-white shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
                          : "border-white/18 bg-white/8 hover:border-white/40"
                      }`}
                      aria-label={`Показать фото ${index + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain"
                        onError={() => handleImageError(image)}
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
