import React, { useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { api, media } from "./platform";

export default function PreparationPhoto({ asset, studentId, onState }) {
  const [picture, setPicture] = useState({ key: "", src: "", error: "" });
  const [attempt, setAttempt] = useState(0);
  const key = `${studentId || "self"}:${asset.id}`;
  useEffect(() => {
    let alive = true;
    setPicture({ key, src: "", error: "" });
    onState?.(asset.id, "loading");
    const loading = studentId
      ? api(
          `preparation/students/${encodeURIComponent(studentId)}/files/${encodeURIComponent(asset.id)}`,
        ).then((value) => value.dataUrl)
      : media(asset.id);
    loading
      .then((src) => {
        if (!alive) return;
        if (!src) throw new Error("图片读取失败");
        setPicture({ key, src, error: "" });
      })
      .catch(() => {
        if (alive) {
          setPicture({ key, src: "", error: "图片读取失败" });
          onState?.(asset.id, "error");
        }
      });
    return () => {
      alive = false;
    };
  }, [key, attempt]);
  if (picture.key !== key || !picture.src)
    return (
      <div
        className="prep-photo-loading"
        role={picture.error ? "alert" : "status"}
      >
        <span>
          {picture.key === key && picture.error ? picture.error : "读取图片…"}
        </span>
        {picture.key === key && picture.error && (
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <ArrowClockwise />
            重新读取图片
          </button>
        )}
      </div>
    );
  return (
    <button
      type="button"
      data-image-zoom
      className="photo-zoom-button"
      aria-label={`查看${asset.title || "线索图片"}大图`}
    >
      <img
        src={picture.src}
        alt={asset.title || "线索图片"}
        onLoad={() => onState?.(asset.id, "loaded")}
        onError={() => {
          setPicture({ key, src: "", error: "图片读取失败" });
          onState?.(asset.id, "error");
        }}
      />
    </button>
  );
}
