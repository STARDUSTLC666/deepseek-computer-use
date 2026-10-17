
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

public static class Json
{
    public static string ToJson(object value)
    {
        StringBuilder sb = new StringBuilder(256);
        Write(sb, value);
        return sb.ToString();
    }

    static void WriteString(StringBuilder sb, string s)
    {
        sb.Append('"');
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                default:
                    if (c < 0x20 || c == 0x7f)
                    {
                        sb.Append("\\u");
                        sb.Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }

    static void Write(StringBuilder sb, object v)
    {
        if (v == null) { sb.Append("null"); return; }
        string s = v as string;
        if (s != null) { WriteString(sb, s); return; }
        if (v is bool) { sb.Append(((bool)v) ? "true" : "false"); return; }
        if (v is int || v is long || v is short || v is byte) { sb.Append(Convert.ToInt64(v).ToString(CultureInfo.InvariantCulture)); return; }
        if (v is decimal) { sb.Append(((decimal)v).ToString(CultureInfo.InvariantCulture)); return; }
        if (v is double || v is float)
        {
            double d = Convert.ToDouble(v);
            if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append("null"); return; }
            sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
            return;
        }
        IDictionary dict = v as IDictionary;
        if (dict != null)
        {
            sb.Append('{');
            bool first = true;
            foreach (DictionaryEntry e in dict)
            {
                if (!first) sb.Append(',');
                first = false;
                WriteString(sb, Convert.ToString(e.Key, CultureInfo.InvariantCulture));
                sb.Append(':');
                Write(sb, e.Value);
            }
            sb.Append('}');
            return;
        }
        IEnumerable list = v as IEnumerable;
        if (list != null)
        {
            sb.Append('[');
            bool first = true;
            foreach (object item in list)
            {
                if (!first) sb.Append(',');
                first = false;
                Write(sb, item);
            }
            sb.Append(']');
            return;
        }
        WriteString(sb, Convert.ToString(v, CultureInfo.InvariantCulture));
    }

    public static object Parse(string text)
    {
        Parser p = new Parser(text);
        object v = p.ParseValue();
        p.SkipWs();
        return v;
    }

    class Parser
    {
        readonly string _s;
        int _i;

        public Parser(string s) { _s = s; _i = 0; }

        public void SkipWs()
        {
            while (_i < _s.Length)
            {
                char c = _s[_i];
                if (c == ' ' || c == '\t' || c == '\r' || c == '\n') _i++;
                else break;
            }
        }

        public object ParseValue()
        {
            SkipWs();
            if (_i >= _s.Length) throw new FormatException("unexpected end of json");
            char c = _s[_i];
            if (c == '{') return ParseObject();
            if (c == '[') return ParseArray();
            if (c == '"') return ParseString();
            if (c == 't') { Expect("true"); return true; }
            if (c == 'f') { Expect("false"); return false; }
            if (c == 'n') { Expect("null"); return null; }
            return ParseNumber();
        }

        void Expect(string lit)
        {
            if (string.CompareOrdinal(_s, _i, lit, 0, lit.Length) != 0) throw new FormatException("bad literal at " + _i);
            _i += lit.Length;
        }

        Dictionary<string, object> ParseObject()
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            _i++;
            SkipWs();
            if (_i < _s.Length && _s[_i] == '}') { _i++; return d; }
            while (true)
            {
                SkipWs();
                string key = ParseString();
                SkipWs();
                if (_s[_i] != ':') throw new FormatException("expected : at " + _i);
                _i++;
                object val = ParseValue();
                d[key] = val;
                SkipWs();
                if (_i >= _s.Length) throw new FormatException("unterminated object");
                char c = _s[_i];
                if (c == ',') { _i++; continue; }
                if (c == '}') { _i++; break; }
                throw new FormatException("expected , or } at " + _i);
            }
            return d;
        }

        List<object> ParseArray()
        {
            List<object> list = new List<object>();
            _i++;
            SkipWs();
            if (_i < _s.Length && _s[_i] == ']') { _i++; return list; }
            while (true)
            {
                list.Add(ParseValue());
                SkipWs();
                if (_i >= _s.Length) throw new FormatException("unterminated array");
                char c = _s[_i];
                if (c == ',') { _i++; continue; }
                if (c == ']') { _i++; break; }
                throw new FormatException("expected , or ] at " + _i);
            }
            return list;
        }

        string ParseString()
        {
            if (_s[_i] != '"') throw new FormatException("expected string at " + _i);
            _i++;
            StringBuilder sb = new StringBuilder();
            while (true)
            {
                if (_i >= _s.Length) throw new FormatException("unterminated string");
                char c = _s[_i++];
                if (c == '"') break;
                if (c != '\\') { sb.Append(c); continue; }
                if (_i >= _s.Length) throw new FormatException("bad escape");
                char e = _s[_i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (_i + 4 > _s.Length) throw new FormatException("bad unicode escape");
                        sb.Append((char)int.Parse(_s.Substring(_i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        _i += 4;
                        break;
                    default: throw new FormatException("bad escape char " + e);
                }
            }
            return sb.ToString();
        }

        object ParseNumber()
        {
            int start = _i;
            while (_i < _s.Length)
            {
                char c = _s[_i];
                if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') _i++;
                else break;
            }
            string raw = _s.Substring(start, _i - start);
            long l;
            if (long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out l)) return l;
            double d;
            if (double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out d)) return d;
            throw new FormatException("bad number '" + raw + "'");
        }
    }

    public static Dictionary<string, object> AsObject(object v) { return v as Dictionary<string, object>; }

    public static object Get(Dictionary<string, object> d, string key)
    {
        if (d == null) return null;
        object v;
        if (d.TryGetValue(key, out v)) return v;
        return null;
    }

    public static string GetString(Dictionary<string, object> d, string key)
    {
        object v = Get(d, key);
        if (v == null) return null;
        return Convert.ToString(v, CultureInfo.InvariantCulture);
    }

    public static long GetLong(Dictionary<string, object> d, string key, long fallback)
    {
        object v = Get(d, key);
        if (v == null) return fallback;
        try { return Convert.ToInt64(v, CultureInfo.InvariantCulture); } catch { return fallback; }
    }

    public static double GetDouble(Dictionary<string, object> d, string key, double fallback)
    {
        object v = Get(d, key);
        if (v == null) return fallback;
        try { return Convert.ToDouble(v, CultureInfo.InvariantCulture); } catch { return fallback; }
    }

    public static bool GetBool(Dictionary<string, object> d, string key, bool fallback)
    {
        object v = Get(d, key);
        if (v == null) return fallback;
        if (v is bool) return (bool)v;
        string s = v as string;
        if (s != null) return string.Equals(s, "true", StringComparison.OrdinalIgnoreCase);
        return fallback;
    }
}
