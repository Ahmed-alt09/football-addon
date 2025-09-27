import axios from "axios";
import express from "express";

const app = express();
const PORT = 4000;

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "x-mas": "eyJib2R5Ijp7InVybCI6Ii9hcGkvZGF0YS9tYXRjaGVzP2RhdGU9MjAyNTA5MjcmdGltZXpvbmU9QWZyaWNhJTJGTGFnb3MmY2NvZGUzPU5HQSIsImNvZGUiOjE3NTg5NzUxNzYxNDEsImZvbyI6InByb2R1Y3Rpb246ZGI0NTRhMGZjZjE5MzUwNjdmYmEyNWI0MGFjZjI1NTQ1ZGY0ZTEyYyJ9LCJzaWduYXR1cmUiOiI2QjUyREU3NkZCQjU3OUFBRkZBMTIxMjBERjNDMEQyMiJ9",
    "Referer": "https://www.fotmob.com/",
    "Connection": "keep-alive",
  },
});

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(type, identifier) {
  return `${type}:${identifier}`;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

function extractMatchIds(responseData) {
  const matchIds = [];
  if (responseData.data?.leagues) {
    responseData.data.leagues.forEach((league) => {
      if (league.matches) {
        league.matches.forEach((match) => {
          matchIds.push(match.id);
        });
      }
    });
  }
  return matchIds;
}

async function fetchMatchDetailsPage(matchIds, pageSize = 20) {
  const matchPromises = matchIds.map(async (matchId) => {
    const cacheKey = getCacheKey('match', matchId);
    const cached = getCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`;
      const response = await axiosInstance.get(url);
      const data = response.data.content.matchFacts.infoBox;
      
      setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error fetching match ${matchId}:`, error.response?.status || error.message);
      return { matchId, error: true };
    }
  });

  const results = await Promise.allSettled(matchPromises);
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return { matchId: matchIds[index], error: true };
    }
  });
}

async function fetchSportData(compactDate) {
  const cacheKey = getCacheKey('sport', compactDate);
  const cached = getCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await axiosInstance.get(
      `https://www.fotmob.com/api/data/matches?date=${compactDate}&timezone=Africa%2FLagos&ccode3=NGA`
    );

    const data = response.data;
    
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error fetching sport data:", error.response?.status || error.message);
    throw error;
  }
}

function paginate(array, page, pageSize) {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  return array.slice(startIndex, endIndex);
}

function getPaginationMeta(totalItems, page, pageSize) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    currentPage: page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null,
  };
}

app.get("/sport/scheduled-events", async (req, res) => {
  const startTime = Date.now();
  const date = req.query.date;
  const sport = req.query.type;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;

  if (sport !== "football") {
    return res.status(400).json({ error: "Only football is supported" });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Date must be in YYYY-MM-DD format" });
  }

  if (page < 1) {
    return res.status(400).json({ error: "Page must be >= 1" });
  }

  if (pageSize < 1 || pageSize > 100) {
    return res.status(400).json({ error: "Page size must be between 1 and 100" });
  }

  try {
    const compactDate = date.replace(/-/g, "");

    const sportData = await fetchSportData(compactDate);

    const allMatchIds = extractMatchIds({ data: sportData });
    console.log(`Found ${allMatchIds.length} matches for ${date}`);

    if (allMatchIds.length === 0) {
      return res.json({
        status: "success",
        date: compactDate,
        data: [],
        pagination: getPaginationMeta(0, page, pageSize),
        processingTime: `${Date.now() - startTime}ms`,
      });
    }

    const paginatedMatchIds = paginate(allMatchIds, page, pageSize);
    
    if (paginatedMatchIds.length === 0) {
      return res.status(404).json({
        error: "Page not found",
        pagination: getPaginationMeta(allMatchIds.length, page, pageSize),
      });
    }

    const matchDetails = await fetchMatchDetailsPage(paginatedMatchIds, pageSize);

    const successfulMatches = matchDetails.filter(match => !match.error);
    const failedCount = matchDetails.length - successfulMatches.length;

    const processingTime = Date.now() - startTime;
    console.log(`Page ${page}: Processed ${paginatedMatchIds.length} matches in ${processingTime}ms (${failedCount} failed)`);

    return res.json({
      status: "success",
      date: compactDate,
      data: successfulMatches,
      failedMatches: failedCount,
      pagination: getPaginationMeta(allMatchIds.length, page, pageSize),
      processingTime: `${processingTime}ms`,
      cacheHits: cache.size,
    });
  } catch (error) {
    console.error("API error:", error.message);
    return res.status(500).json({ 
      error: "Failed to fetch sport data",
      processingTime: `${Date.now() - startTime}ms`
    });
  }
});

app.get("/sport/scheduled-events/all", async (req, res) => {
  const startTime = Date.now();
  const date = req.query.date;
  const sport = req.query.type;

  if (sport !== "football") {
    return res.status(400).json({ error: "Only football is supported" });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Date must be in YYYY-MM-DD format" });
  }

  try {
    const compactDate = date.replace(/-/g, "");

    const sportData = await fetchSportData(compactDate);
    const allMatchIds = extractMatchIds({ data: sportData });

    if (allMatchIds.length === 0) {
      return res.json({
        status: "success",
        date: compactDate,
        totalMatches: 0,
        data: [],
        processingTime: `${Date.now() - startTime}ms`,
      });
    }

    const matchDetails = await fetchMatchDetailsPage(allMatchIds);
    const successfulMatches = matchDetails.filter(match => !match.error);
    const failedCount = matchDetails.length - successfulMatches.length;

    const processingTime = Date.now() - startTime;

    return res.json({
      status: "success",
      date: compactDate,
      totalMatches: successfulMatches.length,
      failedMatches: failedCount,
      data: successfulMatches,
      processingTime: `${processingTime}ms`,
    });
  } catch (error) {
    console.error("API error:", error.message);
    return res.status(500).json({ 
      error: "Failed to fetch sport data",
      processingTime: `${Date.now() - startTime}ms`
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    uptime: process.uptime(),
    cacheSize: cache.size 
  });
});

app.get("/cache/stats", (req, res) => {
  const stats = {
    size: cache.size,
    entries: Array.from(cache.keys()).map(key => ({
      key,
      age: Math.round((Date.now() - cache.get(key).timestamp) / 1000),
    }))
  };
  res.json(stats);
});

app.delete("/cache", (req, res) => {
  cache.clear();
  res.json({ message: "Cache cleared" });
});

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 60000);

app.listen(PORT, () => {
  console.log(`Paginated Football API running on http://localhost:${PORT}`);
  console.log(`Default page size: 20, Cache TTL: ${CACHE_TTL / 1000}s`);
});