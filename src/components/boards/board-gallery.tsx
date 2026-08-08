"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./board-gallery.module.css";

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
      <div className={`${styles.galleryFrame} ${styles.fallbackFrame}`}>
        <div className={styles.fallbackGrid} aria-hidden="true" />
        <div className={styles.fallbackIdentity}>
          <p>{brand}</p>
          <p className={styles.fallbackModel}>{modelName}</p>
          <span>Фото пока не подготовлены</span>
          <p>
            Размерная сетка и характеристики модели остаются доступны ниже.
          </p>
        </div>
        <div className={styles.fallbackMeasurement} aria-hidden="true">
          <span />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.galleryFrame}>
        <div className={styles.measurementGrid} aria-hidden="true" />
        <button
          type="button"
          onClick={() => openViewer(activeImage)}
          className={styles.mainImageButton}
          aria-label="Открыть фото в полном размере"
        >
          <div className={styles.imageCanvas}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={activeImage}
              src={activeImage}
              alt={`${brand} ${modelName}`}
              loading="eager"
              className={styles.mainImage}
              onError={() => handleImageError(activeImage)}
            />
          </div>

          <div className={styles.imageMeta}>
            <span>
              {availableImages.length > 1
                ? `Фото ${availableImages.indexOf(activeImage) + 1} из ${availableImages.length}`
                : "Фото модели"}
            </span>
            <span className={styles.openAffordance}>Открыть крупнее</span>
          </div>
        </button>

        {availableImages.length > 1 ? (
          <div className={styles.thumbnails} aria-label="Фотографии модели">
            {availableImages.map((image, index) => {
              const isActive = image === activeImage;

              return (
                <button
                  key={image}
                  type="button"
                  onClick={() => selectImage(image)}
                  className={styles.thumbnailButton}
                  aria-label={`Показать фото ${index + 1}`}
                  aria-pressed={isActive}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
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
          className={styles.viewerBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${brand} ${modelName}`}
          onClick={closeViewer}
        >
          <div
            className={styles.viewerPanel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.viewerHeader}>
              <div>
                <p>{brand}</p>
                <h2>{modelName}</h2>
              </div>

              <button
                type="button"
                onClick={closeViewer}
                className={styles.viewerClose}
              >
                Закрыть
              </button>
            </div>

            <div className={styles.viewerStage}>
              {availableImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => showNeighborImage(-1)}
                    className={`${styles.viewerArrow} ${styles.viewerArrowPrevious}`}
                    aria-label="Предыдущее фото"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => showNeighborImage(1)}
                    className={`${styles.viewerArrow} ${styles.viewerArrowNext}`}
                    aria-label="Следующее фото"
                  >
                    ›
                  </button>
                </>
              ) : null}

              <div className={styles.viewerCanvas}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${activeImage}-viewer`}
                  src={activeImage}
                  alt={`${brand} ${modelName}`}
                  className={styles.viewerImage}
                  onError={() => handleImageError(activeImage)}
                />
              </div>
            </div>

            {availableImages.length > 1 ? (
              <div className={styles.viewerThumbnails}>
                {availableImages.map((image, index) => {
                  const isActive = image === activeImage;

                  return (
                    <button
                      key={`${image}-viewer-thumb`}
                      type="button"
                      onClick={() => selectImage(image)}
                      className={styles.viewerThumbnailButton}
                      aria-label={`Показать фото ${index + 1}`}
                      aria-pressed={isActive}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
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
