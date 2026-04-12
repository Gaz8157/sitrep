"use client";

import { useState, useEffect, useCallback } from "react";

interface Mod {
  modId: string;
  name: string;
  version: string;
}

interface WorkshopItem {
  id?: string;
  guid?: string;
  name: string;
  author?: string;
  summary?: string;
  description?: string;
  rating?: number;
  ratingCount?: number;
  subscribers?: number;
  subscriberCount?: number;
  downloads?: number;
  size?: number;
  fileSize?: number;
  version?: string;
  versions?: { tag?: string; gameVersion?: string }[];
  thumbnailUrl?: string;
  thumbnail?: string;
  previewUrl?: string;
  preview?: string;
  image?: string;
  tags?: string[];
  updatedAt?: string;
  createdAt?: string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function getThumb(item: WorkshopItem): string | null {
  return item.thumbnailUrl || item.thumbnail || item.previewUrl || item.preview || item.image || null;
}

export function ModManager() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WorkshopItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedMod, setSelectedMod] = useState<WorkshopItem | null>(null);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"installed" | "workshop">("installed");

  const loadMods = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/server/mods");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMods(data.mods || []);
      }
    } catch {
      setError("Failed to load mods");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMods();
  }, [loadMods]);

  const saveMods = async (newMods: Mod[]) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/server/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mods: newMods }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        setSuccess(`Saved ${data.count} mods`);
        setMods(newMods);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.detail || "Save failed");
      }
    } catch {
      setError("Failed to save mods");
    }
    setSaving(false);
  };

  const removeMod = (modId: string) => {
    const newMods = mods.filter((m) => m.modId !== modId);
    saveMods(newMods);
  };

  const addMod = (item: WorkshopItem, version: string = "") => {
    const id = item.id || item.guid || "";
    if (mods.some((m) => m.modId === id)) {
      setError("Mod already installed");
      setTimeout(() => setError(""), 3000);
      return;
    }
    const newMod: Mod = {
      modId: id,
      name: item.name,
      version: version,
    };
    saveMods([...mods, newMod]);
    setSelectedMod(null);
  };

  const searchWorkshop = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setActiveTab("workshop");
    try {
      const res = await fetch(`/api/workshop/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (data.error) {
        setSearchError(data.error);
      }
      const items = data.data || data.items || data.results || [];
      setSearchResults(Array.isArray(items) ? items : []);
    } catch {
      setSearchError("Workshop search failed");
    }
    setSearching(false);
  };

  const filteredMods = filter
    ? mods.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
    : mods;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Mod Manager</h2>
            <p className="text-xs text-[#6b6b80] mt-0.5">
              {mods.length} mods installed • Search & manage Arma Reforger Workshop mods
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadMods}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-[#6b6b80] hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-all"
            >
              RELOAD
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#55556a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchWorkshop()}
              placeholder="Search workshop mods..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-10 pr-3 py-2.5 text-[13px] text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-[#c84031] focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={searchWorkshop}
            disabled={searching || !searchQuery.trim()}
            className="px-5 py-2.5 rounded-lg text-[12px] font-bold text-white bg-[#c84031] hover:bg-[#b5392c] transition-all disabled:opacity-50"
          >
            {searching ? "Searching..." : "SEARCH"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("installed")}
            className={`px-4 py-2 rounded-md text-[11px] font-bold tracking-wider transition-all ${
              activeTab === "installed"
                ? "bg-white/[0.08] text-white border border-white/[0.1]"
                : "text-[#6b6b80] hover:text-white hover:bg-white/[0.03]"
            }`}
          >
            INSTALLED ({mods.length})
          </button>
          <button
            onClick={() => setActiveTab("workshop")}
            className={`px-4 py-2 rounded-md text-[11px] font-bold tracking-wider transition-all ${
              activeTab === "workshop"
                ? "bg-white/[0.08] text-white border border-white/[0.1]"
                : "text-[#6b6b80] hover:text-white hover:bg-white/[0.03]"
            }`}
          >
            WORKSHOP {searchResults.length > 0 && `(${searchResults.length})`}
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2 rounded-lg bg-[#1c1016] border border-[#3d1f1f] text-[12px] text-[#ef4444]">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mt-3 px-4 py-2 rounded-lg bg-[#101c16] border border-[#1f3d2a] text-[12px] text-[#22c55e]">
          {success}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ─── Installed Tab ─── */}
        {activeTab === "installed" && (
          <div className="p-4">
            <div className="mb-3">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter installed mods..."
                className="w-full max-w-sm bg-white/[0.03] border border-white/[0.06] rounded-md px-3 py-2 text-[12px] font-mono text-[#c8c8d0] placeholder:text-[#4a4a5a] focus:border-white/[0.15] focus:outline-none transition-colors"
              />
            </div>

            {loading ? (
              <div className="text-center py-12 text-[#6b6b80] text-sm">Loading mods...</div>
            ) : (
              <div className="space-y-1">
                {filteredMods.map((mod) => (
                  <div
                    key={mod.modId}
                    className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.08] transition-all"
                  >
                    <div className="w-9 h-9 rounded-md bg-[#c84031]/10 border border-[#c84031]/20 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-[#c84031]/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-white/90 truncate">{mod.name}</div>
                      <div className="text-[10px] font-mono text-[#55556a] truncate">
                        {mod.modId}
                        {mod.version ? (
                          <span className="ml-2 text-[#c84031]/60">v{mod.version}</span>
                        ) : (
                          <span className="ml-2 text-[#22c55e]/60">latest</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeMod(mod.modId)}
                      disabled={saving}
                      className="opacity-0 group-hover:opacity-100 px-2.5 py-1.5 rounded-md text-[10px] font-bold text-[#ef4444]/70 hover:text-[#ef4444] bg-[#ef4444]/[0.06] hover:bg-[#ef4444]/[0.12] border border-transparent hover:border-[#ef4444]/20 transition-all disabled:opacity-30"
                    >
                      REMOVE
                    </button>
                  </div>
                ))}
                {filteredMods.length === 0 && (
                  <div className="text-center py-12 text-[#55556a] text-xs">
                    {filter ? "No mods match your filter" : "No mods installed"}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Workshop Tab ─── */}
        {activeTab === "workshop" && (
          <div className="p-4">
            {searchError && (
              <div className="mb-4 px-4 py-2 rounded-lg bg-[#1c1016] border border-[#3d1f1f] text-[12px] text-[#ef4444]">
                {searchError}
              </div>
            )}

            {searching && (
              <div className="text-center py-16 text-[#6b6b80] text-sm">
                <div className="animate-pulse">Searching Arma Reforger Workshop...</div>
              </div>
            )}

            {searchResults.length === 0 && !searching && (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#44445a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <p className="text-sm text-[#55556a]">Search for mods above</p>
                <p className="text-[11px] text-[#3a3a4a] mt-1">Results will appear as cards like the Workshop</p>
              </div>
            )}

            {/* Workshop Card Grid — matches Arma Workshop style */}
            {searchResults.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {searchResults.map((item, i) => {
                  const itemId = item.id || item.guid || `search-${i}`;
                  const isInstalled = mods.some((m) => m.modId === itemId);
                  const thumb = getThumb(item);
                  const rating = item.rating != null ? Math.round(item.rating * 100) : null;
                  const size = formatSize(item.size || item.fileSize);

                  return (
                    <div
                      key={itemId}
                      onClick={() => setSelectedMod(item)}
                      className="group rounded-lg bg-[#12121a] border border-white/[0.06] hover:border-[#c84031]/40 cursor-pointer transition-all overflow-hidden hover:shadow-[0_0_20px_rgba(200,64,49,0.1)]"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-[16/10] bg-[#0c0c14] overflow-hidden">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#15151f] to-[#0c0c14]">
                            <svg className="w-10 h-10 text-[#2a2a3a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                              <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                            </svg>
                          </div>
                        )}

                        {/* Overlay badges */}
                        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-2 pb-1.5 bg-gradient-to-t from-black/80 to-transparent pt-6">
                          {size && (
                            <span className="text-[10px] font-mono text-white/70 flex items-center gap-1">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
                              </svg>
                              {size}
                            </span>
                          )}
                          {rating != null && (
                            <span className="text-[10px] font-bold text-[#22c55e] flex items-center gap-0.5">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a1.941 1.941 0 00-.654 1.299l-.002.024a2.04 2.04 0 00.586 1.58l.078.078a1.96 1.96 0 001.38.573h.075a1.96 1.96 0 001.38-.573l.078-.078c.423-.423.654-.996.654-1.593v-.012a1.96 1.96 0 00-.576-1.393l-.076-.076a1.96 1.96 0 00-1.38-.573h-.15c-.52 0-1.018.207-1.393.573z" />
                              </svg>
                              {rating}%
                            </span>
                          )}
                        </div>

                        {/* Installed badge */}
                        {isInstalled && (
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#22c55e]/90 text-[9px] font-bold text-white tracking-wider">
                            INSTALLED
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3">
                        <div className="text-[12px] font-semibold text-white/90 truncate leading-tight">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-[#6b6b80] mt-1 truncate">
                          {item.author && <>by {item.author}</>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Mod Detail Modal ─── */}
      {selectedMod && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setSelectedMod(null)}
        >
          <div
            className="relative w-full max-w-lg mx-4 rounded-xl bg-[#13131d] border border-white/[0.1] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Thumbnail */}
            {(() => {
              const thumb = getThumb(selectedMod);
              return thumb ? (
                <div className="aspect-[16/9] bg-[#0c0c14]">
                  <img src={thumb} alt={selectedMod.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-[16/9] bg-gradient-to-br from-[#1a1a2a] to-[#0c0c14] flex items-center justify-center">
                  <svg className="w-16 h-16 text-[#2a2a3a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                </div>
              );
            })()}

            {/* Close button */}
            <button
              onClick={() => setSelectedMod(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/70 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Content */}
            <div className="p-5">
              <h3 className="text-lg font-bold text-white">{selectedMod.name}</h3>
              {selectedMod.author && (
                <p className="text-xs text-[#6b6b80] mt-1">by {selectedMod.author}</p>
              )}

              {/* Stats row */}
              <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-[#8888a0]">
                {selectedMod.rating != null && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-[#22c55e]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a1.941 1.941 0 00-.654 1.299l-.002.024a2.04 2.04 0 00.586 1.58l.078.078a1.96 1.96 0 001.38.573h.075a1.96 1.96 0 001.38-.573l.078-.078c.423-.423.654-.996.654-1.593v-.012a1.96 1.96 0 00-.576-1.393l-.076-.076a1.96 1.96 0 00-1.38-.573h-.15c-.52 0-1.018.207-1.393.573z" />
                    </svg>
                    {Math.round(selectedMod.rating * 100)}%
                  </span>
                )}
                {(selectedMod.size || selectedMod.fileSize) && (
                  <span>{formatSize(selectedMod.size || selectedMod.fileSize)}</span>
                )}
                {(selectedMod.subscribers ?? selectedMod.subscriberCount) != null && (
                  <span>{((selectedMod.subscribers ?? selectedMod.subscriberCount) || 0).toLocaleString()} subscribers</span>
                )}
                {selectedMod.downloads != null && (
                  <span>{selectedMod.downloads.toLocaleString()} downloads</span>
                )}
              </div>

              {/* Description */}
              <p className="text-[12px] text-[#8888a0] leading-relaxed mt-4 max-h-[120px] overflow-y-auto">
                {selectedMod.summary || selectedMod.description || "No description available."}
              </p>

              {/* Version info */}
              {selectedMod.versions && selectedMod.versions.length > 0 && (
                <div className="mt-3 text-[10px] font-mono text-[#55556a]">
                  Latest version: {selectedMod.versions[0].tag || "unknown"}
                  {selectedMod.versions[0].gameVersion && (
                    <span className="ml-2">• Game: {selectedMod.versions[0].gameVersion}</span>
                  )}
                </div>
              )}

              <div className="text-[10px] font-mono text-[#44445a] mt-1">
                ID: {selectedMod.id || selectedMod.guid}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-5">
                {mods.some((m) => m.modId === (selectedMod.id || selectedMod.guid)) ? (
                  <div className="flex-1 py-3 rounded-lg text-center text-[12px] font-bold text-[#22c55e] bg-[#22c55e]/[0.08] border border-[#22c55e]/20">
                    ✓ Already Installed
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => addMod(selectedMod, "")}
                      disabled={saving}
                      className="flex-1 py-3 rounded-lg text-[12px] font-bold text-white bg-[#c84031] hover:bg-[#b5392c] transition-all disabled:opacity-50"
                    >
                      + Add (Latest)
                    </button>
                    {selectedMod.versions && selectedMod.versions.length > 0 && selectedMod.versions[0].tag && (
                      <button
                        onClick={() => addMod(selectedMod, selectedMod.versions![0].tag!)}
                        disabled={saving}
                        className="py-3 px-4 rounded-lg text-[11px] font-bold text-[#c8c8d0] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all disabled:opacity-50"
                      >
                        v{selectedMod.versions[0].tag}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
