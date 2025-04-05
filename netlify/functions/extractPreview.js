const { Buffer } = require('buffer');
const pdf = require('pdf-parse');

function isFebruaryStyle(lines) {
  return lines.some(line => /\d{1,2}[AP]\s+/.test(line)) && lines.some(line => /Daily puzzler|Good News|BINGO/i.test(line));
}

function isActivityConnectionStyle(lines) {
  return lines.filter(l => l.match(/^\d{1,2}$/)).length >= 20 &&
         lines.some(l => l.match(/\d{1,2}(A|P)/)) &&
         lines.some(l => l.includes("L") || l.includes("RH") || l.includes("DR"));
}

function isTownHallStyle(lines) {
  return lines.some(line => line.match(/^\d{1,2}\s+[A-Z]/)) &&
         lines.join(" ").match(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
}

exports.handler = async function(event, context) {
  try {
    const { body: base64 } = JSON.parse(event.body);
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    const rawText = data.text;
    const rawLines = rawText.split(/\n|\r|\r\n/).map((line, idx) => ({
      text: line,
      raw: line,
      index: idx,
      indent: line.match(/^\s+/)?.[0]?.length || 0
    })).filter(l => l.text.trim());

    const lines = rawLines.map(l => l.text);
    const results = [];

    const currentMonth = "02";
    let currentDay = null;
    let lastEvent = null;

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAndTimeRegex = /^(\d{1,2})\s+(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAllDayRegex = /^(\d{1,2})\s+(.+)/;
    const dayOnlyRegex = /^\d{1,2}$/;

    // Quilt-style parsing
    if (isFebruaryStyle(lines)) {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].text.trim();
        const indent = rawLines[i].indent;

        if (indent > 1 && lastEvent) {
          lastEvent.title += " " + line.trim();
          continue;
        }

        const timeSplit = line.match(splitDayAndTimeRegex);
        if (timeSplit) {
          const [, baseDayStr, hourStr, ampm, title] = timeSplit;
          const baseDay = parseInt(baseDayStr);
          let hour = parseInt(hourStr);
          if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
          if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
          currentDay = baseDay + 1;
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

        const alldaySplit = line.match(splitDayAllDayRegex);
        if (alldaySplit && !timeApmRegex.test(line)) {
          const possibleDay = parseInt(alldaySplit[1]);
          const rest = alldaySplit[2].trim();
          if (!isNaN(possibleDay)) {
            const effectiveDay = currentDay === null ? possibleDay : possibleDay + 1;
            currentDay = possibleDay;
            const evt = {
              month: currentMonth,
              day: effectiveDay,
              title: rest,
              hour: null,
              minute: null,
              location: ""
            };
            results.push(evt);
            lastEvent = evt;
            continue;
          }
        }

        if (dayOnlyRegex.test(line)) {
          currentDay = parseInt(line);
          continue;
        }

        const match = line.match(timeApmRegex);
        if (match && currentDay !== null) {
          let [, hourStr, ampm, title] = match;
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

        if (currentDay !== null) {
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
    }

    // Activity Connection (basic support)
    else if (isActivityConnectionStyle(lines)) {
      let currentDay = null;
      for (const line of lines) {
        if (line.match(/^\d{1,2}$/)) {
          currentDay = parseInt(line);
          continue;
        }
        const timeMatch = line.match(/(\d{1,2})(A|P)\s+(.*)/i);
        if (timeMatch && currentDay !== null) {
          let [, hourStr, ampm, title] = timeMatch;
          let hour = parseInt(hourStr);
          if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
          if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;
          results.push({
            month: currentMonth,
            day: currentDay,
            title: title.trim(),
            hour,
            minute: 0,
            location: ""
          });
        }
      }
    }

    // Town Hall fallback (map each paragraph to each day)
    else if (isTownHallStyle(lines)) {
      const paragraphs = rawText.split(/\n\n+/).filter(p => p.length > 20);
      for (let i = 0; i < paragraphs.length && i < 31; i++) {
        results.push({
          month: "06",
          day: i + 1,
          title: paragraphs[i].trim(),
          hour: null,
          minute: null,
          location: ""
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ parsed: results })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
