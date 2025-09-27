import axios from "axios";
import express from "express";

const app = express();
const PORT = 4000;

app.get("/sport/scheduled-events", async (req, res) => {
  const date = req.query.date;
  const sport = req.query.type;
  const includeDetails = req.query.details === "true";

  if (sport !== "football") {
    return res.status(400).json({ error: "Only football is supported" });
  }

  try {
    const compactDate = date.replace(/-/g, "");
    const data = await fetchSportData(compactDate);

    const leaguesWithLogos = data.leagues.map((league) => ({
      ...league,
      logo: `https://images.fotmob.com/image_resources/logo/leaguelogo/dark/${league.id}.png`,
      matches: league.matches.map((match) => ({
        ...match,
        home: {
          ...match.home,
          logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${match.home.id}_small.png`,
        },
        away: {
          ...match.away,
          logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${match.away.id}_small.png`,
        },
      })),
    }));

    return res.json({
      status: "success",
      date: compactDate,
      includeDetails,
      data: { leagues: leaguesWithLogos },
    });
  } catch (error) {
    console.error("API error:", error.message);
    return res.status(500).json({ error: "Failed to fetch sport data" });
  }
});


app.get("/sport/detail", async (req, res) => {
  const matchId = req.query.id;

  if (!matchId) {
    return res.status(400).json({ error: "Missing match ID" });
  }

  try {
    const headers = {
      "sec-ch-ua":
        '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "x-mas":
        "eyJib2R5Ijp7InVybCI6Ii9hcGkvZGF0YS9tYXRjaGVzP2RhdGU9MjAyNTA5MjcmdGltZXpvbmU9QWZyaWNhJTJGTGFnb3MmY2NvZGUzPU5HQSIsImNvZGUiOjE3NTg5NzUxNzYxNDEsImZvbyI6InByb2R1Y3Rpb246ZGI0NTRhMGZjZjE5MzUwNjdmYmEyNWI0MGFjZjI1NTQ1ZGY0ZTEyYyJ9LCJzaWduYXR1cmUiOiI2QjUyREU3NkZCQjU3OUFBRkZBMTIxMjBERjNDMEQyMiJ9",
      Referer: "https://www.fotmob.com/",
    };

    const response = await axios.get(
      `https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`,
      { headers }
    );

    const matchData = { ...response.data };

    if (matchData?.content?.matchFacts) {
      delete matchData.content.matchFacts.postReview;
      delete matchData.content.matchFacts.preReview;
      delete matchData.content.matchFacts.QAData;
      delete matchData.content.matchFacts.matchInsightsConfig;
      delete matchData.content.matchFacts.h2h;
      delete matchData.content.matchFacts.momentum;
      delete matchData.content.matchFacts.highlightStories;
    }

    return res.json({
      status: "success",
      matchId,
      data: matchData,
    });
  } catch (error) {
    console.error("Error fetching match details:", error.message);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

async function fetchSportData(compactDate) {
  try {
    const headers = {
      "sec-ch-ua":
        '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "x-mas":
        "eyJib2R5Ijp7InVybCI6Ii9hcGkvZGF0YS9tYXRjaGVzP2RhdGU9MjAyNTA5MjcmdGltZXpvbmU9QWZyaWNhJTJGTGFnb3MmY2NvZGUzPU5HQSIsImNvZGUiOjE3NTg5NzUxNzYxNDEsImZvbyI6InByb2R1Y3Rpb246ZGI0NTRhMGZjZjE5MzUwNjdmYmEyNWI0MGFjZjI1NTQ1ZGY0ZTEyYyJ9LCJzaWduYXR1cmUiOiI2QjUyREU3NkZCQjU3OUFBRkZBMTIxMjBERjNDMEQyMiJ9",
      Referer: "https://www.fotmob.com/",
    };

    const response = await axios.get(
      `https://www.fotmob.com/api/data/matches?date=${compactDate}&timezone=Africa%2FLagos&ccode3=NGA`,
      { headers }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Error fetching sport data:",
      error.response?.status,
      error.response?.data || error.message
    );
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Football addon running on http://localhost:${PORT}`);
});
