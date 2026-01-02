# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Security Principles

Detcord is designed with security as a priority:

### Token Handling
- **Never stored**: Your Discord token is never saved to disk or localStorage
- **Never logged**: Tokens are never written to console or log files
- **Never transmitted**: Tokens are only sent to Discord's official API endpoints
- **Masked in UI**: If displayed, tokens are masked (e.g., `****...****`)
- **Format validated**: Token format is validated before use to catch extraction errors

### Data Privacy
- **Local only**: All operations run entirely in your browser
- **No telemetry**: We do not collect any usage data or analytics
- **No external calls**: The only network requests are to `discord.com`
- **No debug API in production**: The `window.Detcord` debug interface is only available in development builds

### Input Validation
- **HTML escaped**: All user-visible text is escaped to prevent XSS
- **Regex validated**: Regex patterns are validated to prevent ReDoS attacks
- **ID sanitized**: Discord IDs (snowflakes) are validated before use in API requests
- **Persistence validated**: Saved progress data is schema-validated before restoration

## Security Measures

### ReDoS Protection
User-provided regex patterns are validated for:
- Maximum length (100 characters)
- Dangerous constructs (nested quantifiers, overlapping alternations)
- Execution time (tested against problematic input)

### Snowflake Validation
All Discord IDs are validated to ensure they:
- Are numeric strings
- Have the correct length (17-19 digits)
- Match the expected snowflake format

### Persistence Security
Saved progress data is:
- Schema-validated on load
- Expired after 24 hours
- Cleared if corruption is detected

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **DO NOT** open a public GitHub issue
2. **[Report via GitHub Security Advisories](https://github.com/agh/detcord/security/advisories/new)** (preferred)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Best Practices for Users

1. **Never share your Discord token** with anyone
2. **Only install Detcord** from official sources (GitHub releases)
3. **Review the code** if you have concerns - it's open source
4. **Keep your browser** and userscript manager updated
5. **Log out of Discord** if you suspect your token was compromised

## Known Limitations

- Detcord cannot protect against malicious browser extensions
- Your token is accessible to any script running on discord.com
- Discord could theoretically detect automated deletion patterns
- The webpack token extraction method may persist a reference in Discord's module cache

## Technical Notes

### Userscript Isolation
The userscript runs with `@grant none`, meaning it executes in the page context without GM API isolation. This is necessary to access Discord's webpack modules and localStorage. The tradeoff is that other scripts on discord.com could potentially interact with Detcord.

### Token Extraction
Tokens are extracted using two methods:
1. **localStorage via iframe**: Uses a fresh iframe context to bypass Discord's localStorage overrides
2. **Webpack introspection**: Accesses Discord's token manager through webpack module cache

Both methods access data that is already available to any script running on discord.com.

## Audit History

| Date | Auditor | Findings | Status |
|------|---------|----------|--------|
| 2026-01-02 | Internal | 8 issues identified (2 high, 3 medium, 3 low) | Resolved |

### v1.0 Security Audit Summary

The following issues were identified and resolved before the v1.0 release:

#### High Severity (Resolved)
1. **ReDoS Vulnerability**: User-provided regex patterns could cause catastrophic backtracking
   - *Fix*: Added `validateRegex()` with pattern analysis and execution time testing

2. **Token Exposure via Debug Interface**: The `window.Detcord` object exposed the UI instance
   - *Fix*: Debug interface now only available in development builds (`__DEV__` flag)

#### Medium Severity (Resolved)
3. **Insufficient Input Validation**: Guild/channel IDs were not validated before URL construction
   - *Fix*: Added `isValidSnowflake()` and `isValidGuildId()` validators

4. **Inconsistent XSS Escaping**: Some UI code used `innerHTML` for dynamic content
   - *Fix*: Audited all `innerHTML` usage; dynamic content uses `textContent` or `escapeHtml()`

5. **Unsafe JSON.parse**: Persistence data was parsed without schema validation
   - *Fix*: Added `isValidProgressData()` runtime type checker

#### Low Severity (Resolved/Documented)
6. **No Token Format Validation**: Extracted tokens were not validated for expected format
   - *Fix*: Added `isValidTokenFormat()` validation in API client constructor

7. **Missing CSP Documentation**: Security tradeoffs of `@grant none` were undocumented
   - *Fix*: Added technical notes section explaining isolation model

8. **Webpack Module Reference**: Token extractor module persists in webpack cache
   - *Fix*: Documented as known limitation
