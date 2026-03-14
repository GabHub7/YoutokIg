module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: "API key belum diset di environment variables" });
  }

  const { url, source = "auto", mode = "info" } = req.query;

  if (!url) return res.status(400).json({ error: "URL kosong" });

  // ── Detect platform ──
  let platform = source;
  if (platform === "auto") {
    if (url.includes("tiktok.com"))     platform = "tiktok";
    else if (url.includes("instagram.com")) platform = "instagram";
    else if (url.includes("youtu"))     platform = "youtube";
    else return res.status(400).json({ error: "Platform tidak dikenali" });
  }

  // ── MODE: DOWNLOAD (stream file) ──
  if (mode === "download") {
    const { fileurl, filename = "video", ext = "mp4" } = req.query;
    if (!fileurl) return res.status(400).json({ error: "fileurl kosong" });

    const mime = ext === "mp3" ? "audio/mpeg" : "video/mp4";
    const safeName = filename.replace(/[^a-zA-Z0-9_\-]/g, "_");

    try {
      const fileRes = await fetch(decodeURIComponent(fileurl), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://www.youtube.com/"
        }
      });

      if (!fileRes.ok) throw new Error(`Upstream error: ${fileRes.status}`);

      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.${ext}"`);
      res.setHeader("Cache-Control", "no-store");

      const buffer = await fileRes.arrayBuffer();
      return res.send(Buffer.from(buffer));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── MODE: INFO ──

  // TikTok & Instagram
  if (platform === "tiktok" || platform === "instagram") {
    try {
      const apiRes = await fetch(
        "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": "social-download-all-in-one.p.rapidapi.com",
            "x-rapidapi-key": RAPIDAPI_KEY
          },
          body: JSON.stringify({ url })
        }
      );
      const data = await apiRes.json();
      const medias = data.medias || [];

      let hd = "", sd = "", mp3 = "";
      for (const m of medias) {
        const q   = (m.quality    || "").toLowerCase();
        const ext = (m.extension  || "").toLowerCase();
        if (!hd  && q.includes("hd") && ext === "mp4")           hd  = m.url || "";
        if (!sd  && q.includes("watermark") && ext === "mp4")    sd  = m.url || "";
        if (!mp3 && ext === "mp3")                                mp3 = m.url || "";
      }
      if (!hd && medias.length > 0) hd = medias[0].url || "";
      if (!sd) sd = hd;

      return res.json({
        source:    platform,
        title:     data.title     || "Video",
        author:    data.author    || "",
        thumbnail: data.thumbnail || "",
        duration:  data.duration  || 0,
        hd, sd, mp3
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // YouTube
  if (platform === "youtube") {
    const vidMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    const vid = vidMatch ? vidMatch[1] : null;
    if (!vid) return res.status(400).json({ error: "URL YouTube tidak valid" });

    try {
      // DEBUG: return raw API response
      const debugRes = await fetch(
        `https://youtube-video-and-shorts-downloader.p.rapidapi.com/download.php?id=${vid}`,
        {
          headers: {
            "x-rapidapi-host": "youtube-video-and-shorts-downloader.p.rapidapi.com",
            "x-rapidapi-key": RAPIDAPI_KEY
          }
        }
      );
      const debugData = await debugRes.json();
      return res.json({ DEBUG: debugData });

      const apiRes = await fetch(
        `https://youtube-video-and-shorts-downloader.p.rapidapi.com/download.php?id=${vid}`,
        {
          headers: {
            "x-rapidapi-host": "youtube-video-and-shorts-downloader.p.rapidapi.com",
            "x-rapidapi-key": RAPIDAPI_KEY
          }
        }
      );
      const data = await apiRes.json();

      let hd = "", sd = "", mp3 = "";
      const links = data.links || {};
      // Cari link MP4 HD, SD, MP3
      for (const [key, val] of Object.entries(links)) {
        const q = (val.quality || key || "").toLowerCase();
        const t = (val.type || "").toLowerCase();
        if (!hd  && (q.includes("720") || q.includes("1080")) && t.includes("mp4")) hd  = val.url || "";
        if (!sd  && q.includes("360") && t.includes("mp4"))                          sd  = val.url || "";
        if (!mp3 && t.includes("mp3"))                                                mp3 = val.url || "";
      }
      if (!hd && Object.values(links).length > 0) hd = Object.values(links)[0].url || "";
      if (!sd) sd = hd;

      const wrap = (u) => u || "";

      return res.json({
        source:    "youtube",
        title:     data.title    || "",
        author:    data.author   || "",
        thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
        duration:  data.duration || 0,
        embedId:   vid,
        hd:  wrap(hd),
        sd:  wrap(sd),
        mp3: wrap(mp3)
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: "Request tidak valid" });
        }
