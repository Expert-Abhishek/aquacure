"use client";

import { useEffect, useState, use } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ImagePage({ params }: PageProps) {
  const { id } = use(params);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchImage = async () => {
      try {
        // 1. Try to fetch from shared_images
        const sharedDoc = await getDoc(doc(db, "shared_images", id));
        if (sharedDoc.exists()) {
          setImage(sharedDoc.data().image);
          setLoading(false);
          return;
        }

        // 2. Try to fetch from quotations
        const quoteDoc = await getDoc(doc(db, "quotations", id));
        if (quoteDoc.exists()) {
          setImage(quoteDoc.data().image);
          setLoading(false);
          return;
        }

        setError(true);
      } catch (err) {
        console.error("Error fetching image:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchImage();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-sky-500"></div>
        <p className="mt-4 text-sm text-slate-400 font-medium">Retrieving high-resolution image...</p>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white p-4">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center max-w-md shadow-xl">
          <span className="text-4xl">⚠️</span>
          <h1 className="mt-4 text-lg font-bold text-slate-200">Image Not Found</h1>
          <p className="mt-2 text-sm text-slate-400">
            The image you are trying to view does not exist, has expired, or is invalid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Sleek top navigation bar */}
      <header className="flex items-center justify-between border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">💧</span>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white uppercase">Aquatech Services</h1>
            <p className="text-[10px] text-slate-500 font-medium">RO System Full View</p>
          </div>
        </div>
        <button
          onClick={() => window.close()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
        >
          Close Tab
        </button>
      </header>

      {/* Main image container */}
      <main className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="relative overflow-hidden rounded-2xl border border-slate-900 bg-slate-900/50 p-2 shadow-2xl max-w-4xl w-full flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="RO System Full View"
            className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain transition-all duration-300 hover:scale-[1.01]"
          />
        </div>
      </main>

      {/* Footer info */}
      <footer className="text-center py-4 border-t border-slate-900 bg-slate-950 text-[11px] text-slate-600">
        &copy; {new Date().getFullYear()} Aquatech Services. All rights reserved.
      </footer>
    </div>
  );
}
