const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

function isFebruaryStyle(lines) {
  return lines.some(line => /\d{1,2}[AP]\s+/.test(line) || line.includes("Daily puzzler"));
}

exports.handler = async function(event, context) {
  try {
    const { body: base64 } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const rawLines = data.text.split(/\n|\r|\r\n/).map(l => l.trim()).filter(Boolean);

    if (!isFebruaryStyle(rawLines)) {
      return { statusCode: 200, body: JSON.stringify({ parsed: [], debug: ["Not a supported calendar format."] }) };
    }

    const lines = [];
    let currentDay = null;
    let currentMonth = "02";

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const dayOnlyRegex = /^\d{1,2}$/;
    const splitDayAndEventRegex = /^(\d{1,2})\s+(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAllDayRegex = /^(\d{1,2})\s+(.+)/; // e.g. "14 Daily puzzler"

    rawLines.forEach((line, index) => {
      const entry = { line, matched: false, result: null, index: index + 1 };

      // Case: "14 9A Good News" → set day=14, event goes to day=15
      const timeSplit = line.match(splitDayAndEventRegex);
      if (timeSplit) {
        const [, baseDayStr, hourStr, ampm, title] = timeSplit;
        const baseDay = parseInt(baseDayStr);
        let hour = parseInt(hourStr);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;

        currentDay = baseDay + 1; // Event goes to next day
        entry.matched = true;
        entry.result = {
          month: currentMonth,
          day: currentDay,
          title: title.trim(),
          hour,
          minute: 0,
          location: ""
        };
        lines.push(entry);
        return;
      }

      // Case: "14 Daily puzzler" → set day=14, event is all-day on day=15
      const alldaySplit = line.match(splitDayAllDayRegex);
      if (alldaySplit && !timeApmRegex.test(line)) {
        const possibleDay = parseInt(alldaySplit[1]);
        if (!isNaN(possibleDay) && possibleDay >= 1 && possibleDay <= 31) {
          currentDay = possibleDay + 1; // Advance day
          const title = alldaySplit[2].trim();
          entry.matched = true;
          entry.result = {
            month: currentMonth,
            day: currentDay,
            title,
            hour: null,
            minute: null,
            location: ""
          };
          lines.push(entry);
          return;
        }
      }

      // Line is just a number → treat as new day header
      const dayMatch = line.match(dayOnlyRegex);
      if (dayMatch) {
        currentDay = parseInt(dayMatch[0]);
        return;
      }

      // Timed event
      const match = line.match(timeApmRegex);
      if (match) {
        let [, hour, ampm, title] = match;
        hour = parseInt(hour);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
        if (currentDay !== null) {
          entry.matched = true;
          entry.result = {
            month: currentMonth,
            day: currentDay,
            title: title.trim(),
            hour,
            minute: 0,
            location: ""
          };
          lines.push(entry);
        }
        return;
      }

      // All-day event
      if (currentDay !== null && line && !line.match(timeApmRegex)) {
        entry.matched = true;
        entry.result = {
          month: currentMonth,
          day: currentDay,
          title: line.trim(),
          hour: null,
          minute: null,
          location: ""
        };
        lines.push(entry);
      }
    });

    const parsed = lines.filter(e => e.matched).map(e => e.result);
    return {
      statusCode: 200,
      body: JSON.stringify({ parsed, debug: lines.slice(0, 60) })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
