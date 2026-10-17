
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

// ---------------------------------------------------------------------------
// stdio JSON-lines bridge: one request object per line in, one response object
// per line out. The DSH plugin owns the process lifetime; this helper owns the
// UI Automation / SendInput / capture state so element indexes stay valid.
// ---------------------------------------------------------------------------
public static class Program
{
    static IPlatformDriver _driver;
    /// Set by the close RPC: the loop stops after flushing the response.
    public static bool CloseRequested;
    /// 130 mirrors Codex's "the user pressed Esc" exit code.
    public static int RequestedExitCode;

    public static int Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            Console.InputEncoding = new UTF8Encoding(false);
        }
        catch { }

        _driver = CreateDriver();

        if (args.Length > 0 && args[0] == "--self-test")
        {
            return SelfTest();
        }

        string line;
        while (true)
        {
            try { line = Console.ReadLine(); }
            catch (Exception) { break; }
            if (line == null) break;
            if (line.Trim().Length == 0) continue;
            string response = Handle(line);
            Console.Out.Write(response);
            Console.Out.Write('\n');
            Console.Out.Flush();
            if (CloseRequested || RequestedExitCode != 0) break;
        }
        try { if (_driver != null) _driver.Dispose(); } catch { }
        return RequestedExitCode;
    }

    static IPlatformDriver CreateDriver()
    {
        string forced = Environment.GetEnvironmentVariable("DSH_CU_PLATFORM");
        if (!string.IsNullOrEmpty(forced) && forced != "windows")
            throw new NotSupportedException("platform '" + forced + "' has no driver implementation yet; only windows is available");
        return new WindowsDriver();
    }

    static int SelfTest()
    {
        Dictionary<string, object> ping = _driver.Ping(new Dictionary<string, object>());
        Dictionary<string, object> wins = _driver.ListWindows(new Dictionary<string, object>());
        Dictionary<string, object> report = new Dictionary<string, object>();
        report["ok"] = true;
        report["platform"] = _driver.PlatformName;
        report["windowCount"] = wins["count"];
        report["driver"] = ping;
        Console.Out.Write(Json.ToJson(report));
        Console.Out.Write('\n');
        Console.Out.Flush();
        return 0;
    }

    static string Handle(string line)
    {
        long id = 0;
        try
        {
            Dictionary<string, object> req = Json.AsObject(Json.Parse(line));
            if (req == null) throw new ToolError("bad_request", "request must be a JSON object");
            id = Json.GetLong(req, "id", 0);
            string method = Json.GetString(req, "method");
            Dictionary<string, object> p = Json.AsObject(Json.Get(req, "params"));
            if (p == null) p = new Dictionary<string, object>();
            // Codex ships the budget with every call (x-oai-cua-request-budget-ms) and the
            // helper honours it; here it bounds capture waits and marks overruns.
            Budget.Begin(Json.GetLong(p, "__budgetMs", 0));
            object result = Dispatch(method, p);
            return Ok(id, result);
        }
        catch (ToolError te)
        {
            return Fail(id, te.Code, te.Message);
        }
        catch (Exception ex)
        {
            return Fail(id, "internal_error", ex.GetType().Name + ": " + ex.Message);
        }
    }

    static object Dispatch(string method, Dictionary<string, object> p)
    {
        if (string.IsNullOrEmpty(method)) throw new ToolError("bad_request", "request.method is required");
        switch (method)
        {
            case "ping": return _driver.Ping(p);
            case "hello": return _driver.Hello(p);
            case "close": return _driver.Close(p);
            case "list_windows": return _driver.ListWindows(p);
            case "list_apps": return _driver.ListApps(p);
            case "get_window": return _driver.GetWindow(p);
            case "launch_app": return _driver.LaunchApp(p);
            case "get_window_state": return _driver.GetWindowState(p);
            case "click": return _driver.Click(p);
            case "press_key": return _driver.PressKey(p);
            case "type_text": return _driver.TypeText(p);
            case "scroll": return _driver.Scroll(p);
            case "drag": return _driver.Drag(p);
            case "set_value": return _driver.SetValue(p);
            case "perform_secondary_action": return _driver.PerformSecondaryAction(p);
            case "activate_window": return _driver.ActivateWindow(p);
            case "overlay_show": return _driver.OverlayShow(p);
            case "overlay_hide": return _driver.OverlayHide(p);
            case "configure": return _driver.Configure(p);
            case "approve_app": return _driver.ApproveApp(p);
            case "end_turn": return _driver.EndTurn(p);
            case "start_audio_recording": return _driver.StartAudioRecording(p);
            case "stop_audio_recording": return _driver.StopAudioRecording(p);
            case "shutdown": return new Dictionary<string, object> { { "bye", true } };
            default: throw new ToolError("unknown_method", "unknown method '" + method + "'");
        }
    }

    static string Ok(long id, object result)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["id"] = id;
        d["ok"] = true;
        d["result"] = result;
        return Json.ToJson(d);
    }

    static string Fail(long id, string code, string message)
    {
        Dictionary<string, object> err = new Dictionary<string, object>();
        err["code"] = code;
        err["message"] = message;
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["id"] = id;
        d["ok"] = false;
        d["error"] = err;
        return Json.ToJson(d);
    }
}
