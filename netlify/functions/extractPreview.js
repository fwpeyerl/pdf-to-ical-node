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
    const rawLines = data.text.split(/\n|\r|\r\n/).map((line, idx) => ({
      text: line,
      raw: line,
      index: idx,
      indent: line.match(/^\s+/)?.[0]?.length || 0
    })).filter(l => l.text.trim());

    if (!isFebruaryStyle(rawLines.map(l => l.text))) {
      return { statusCode: 200, body: JSON.stringify({ parsed: [], debug: ["Not a supported calendar format."] }) };
    }

    const entries = [];
    let currentDay = null;
    let currentMonth = "02";
    let lastEvent = null;

    const timeApmRegex = /^(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAndTimeRegex = /^(\d{1,2})\s+(\d{1,2})(A|P)\s+(.+)/i;
    const splitDayAllDayRegex = /^(\d{1,2})\s+(.+)/;
    const dayOnlyRegex = /^\d{1,2}$/;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].text.trim();
      const indent = rawLines[i].indent;

      // Indented lines = continuation of previous title
      if (indent > 1 && lastEvent) {
        lastEvent.title += " " + line.trim();
        continue;
      }

      const splitTimeMatch = line.match(splitDayAndTimeRegex);
      if (splitTimeMatch) {
        const [, baseDayStr, hourStr, ampm, title] = splitTimeMatch;
        const baseDay = parseInt(baseDayStr);
        let hour = parseInt(hourStr);
        if (ampm.toUpperCase() === "P" && hour < 12) hour += 12;
        if (ampm.toUpperCase() === "A" && hour === 12) hour = 0;

        // Set currentDay to next and assign this to next
        currentDay = baseDay + 1;
        const evt = {
          month: currentMonth,
          day: currentDay,
          title: title.trim(),
          hour,
          minute: 0,
          location: ""
        };
        entries.push(evt);
        lastEvent = evt;
        continue;
      }

      // All-day with embedded date like "1 Daily puzzler"
      const splitAllDayMatch = line.match(splitDayAllDayRegex);
      if (splitAllDayMatch && !timeApmRegex.test(line)) {
        const possibleDay = parseInt(splitAllDayMatch[1]);
        const rest = splitAllDayMatch[2].trim();
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
          entries.push(evt);
          lastEvent = evt;
          continue;
        }
      }

      // Just a day number
      if (dayOnlyRegex.test(line)) {
        currentDay = parseInt(line);
        continue;
      }

      const timeMatch = line.match(timeApmRegex);
      if (timeMatch && currentDay !== null) {
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
        entries.push(evt);
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
        entries.push(evt);
        lastEvent = evt;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ parsed: entries })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
