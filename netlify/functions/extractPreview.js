const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

function isFebruaryStyle(lines) {
  return lines.some(line => /\d{1,2}[AP]\s+/.test(line)) && lines.some(line => /Daily puzzler|Good News|BINGO/i.test(line));
}

function isTownHallStyle(text) {
  return text.includes("TOWN HALL") && text.match(/\n{2,}/);
}

function isUnsupportedActivityCalendar(lines) {
  return lines.some(l => l.includes("Activity Connection")) || lines.filter(l => /^\d{1,2}$/.test(l)).length > 20;
}

exports.handler = async function(event, context) {
  try {
    const { body: base64 } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const rawText = data.text;
    const rawLines = rawText.split(/\n|\r|\r\n/).map((line, idx) => ({
      text: line,
      index: idx,
      indent: line.match(/^\s+/)?.[0]?.length || 0
    })).filter(l => l.text.trim());

    const lines = rawLines.map(l => l.text.trim());
    const results = [];
    const currentMonth = "02";
    let currentDay = null;
    let lastEvent = null;

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAndTimeRegex = /^(\d{1,2})\s+(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAllDayRegex = /^(\d{1,2})\s+(.+)/;
    const dayOnlyRegex = /^\d{1,2}$/;

    if (isTownHallStyle(rawText)) {
      const paragraphs = rawText.split(/\n{2,}/).filter(p => p.length > 10);
      for (let i = 0; i < paragraphs.length && i < 31; i++) {
        results.push({
          month: "06",
          day: i + 1,
          title: paragraphs[i].replace(/\n/g, ' ').trim(),
          hour: null,
          minute: null,
          location: ""
        });
      }
      return { statusCode: 200, body: JSON.stringify({ parsed: results }) };
    }

    if (isUnsupportedActivityCalendar(lines)) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          parsed: [],
          debug: ["Unsupported calendar format (e.g. Activity Connection style)."]
        })
      };
    }

    if (isFebruaryStyle(lines)) {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].text.trim();
        const indent = rawLines[i].indent;

        if (indent > 1 && lastEvent) {
          lastEvent.title += " " + line;
          continue;
        }

        const splitTimeMatch = line.match(splitDayAndTimeRegex);
        if (splitTimeMatch) {
          const [, baseDayStr, hourStr, ampm, title] = splitTimeMatch;
          const baseDay = parseInt(baseDayStr);
          let hour = parseInt(hourStr);
          if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
          if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
          const evt = {
            month: currentMonth,
            day: baseDay + 1,
            title: title.trim(),
            hour,
            minute: 0,
            location: ""
          };
          currentDay = baseDay + 1;
          results.push(evt);
          lastEvent = evt;
          continue;
        }

        const alldaySplit = line.match(splitDayAllDayRegex);
        if (alldaySplit && !timeApmRegex.test(line)) {
          const day = parseInt(alldaySplit[1]);
          const rest = alldaySplit[2];
          if (!isNaN(day)) {
            const isFirstOfDay = results.every(e => e.day !== day);
            const evt = {
              month: currentMonth,
              day: isFirstOfDay ? day : day + 1,
              title: rest,
              hour: null,
              minute: null,
              location: ""
            };
            currentDay = evt.day;
            results.push(evt);
            lastEvent = evt;
            continue;
          }
        }

        if (dayOnlyRegex.test(line)) {
          currentDay = parseInt(line);
          continue;
        }

        const timeMatch = line.match(timeApmRegex);
        if (timeMatch && currentDay) {
          let [, hourStr, ampm, title] = timeMatch;
          let hour = parseInt(hourStr);
          if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
          if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
          const evt = {
            month: currentMonth,
            day: currentDay,
            title: title.trim(),
            hour,
            minute: 0,
            location: ""
          };
          results.push(evt);
          lastEvent = evt;
          continue;
        }

        if (currentDay && line) {
          const evt = {
            month: currentMonth,
            day: currentDay,
            title: line,
            hour: null,
            minute: null,
            location: ""
          };
          results.push(evt);
          lastEvent = evt;
        }
      }
      return { statusCode: 200, body: JSON.stringify({ parsed: results }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ parsed: [], debug: ["Calendar format not recognized."] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unknown error" })
    };
  }
};
