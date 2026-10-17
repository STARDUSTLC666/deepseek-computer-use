using System;
using System.IO;
using System.Threading;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace DshCuAudio
{
    /// WASAPI loopback recorder: captures whatever the machine is playing, which is
    /// what Codex's start/stop_audio_recording expose (gated behind SKY_ENABLE_AUDIO).
    /// Stops on max duration, on the helper's stop file, or on Ctrl+C.
    internal static class Program
    {
        private static int Main(string[] args)
        {
            string output = Path.Combine(Path.GetTempPath(), "dsh-cu-audio.wav");
            int maxMs = 60000;
            string stopFile = null;
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--out") output = args[i + 1];
                else if (args[i] == "--max-ms") int.TryParse(args[i + 1], out maxMs);
                else if (args[i] == "--stop-file") stopFile = args[i + 1];
            }
            if (maxMs < 500) maxMs = 500;

            try
            {
                // Record at the device mix format first, then normalise to the 24 kHz
                // stereo 16-bit WAV that Codex returns.
                string devicePath = output + ".device.wav";
                try { if (File.Exists(devicePath)) File.Delete(devicePath); } catch { }
                using (var capture = new WasapiLoopbackCapture())
                using (var writer = new WaveFileWriter(devicePath, capture.WaveFormat))
                {
                    var stopped = new ManualResetEventSlim(false);
                    Exception failure = null;
                    capture.DataAvailable += (sender, e) =>
                    {
                        try
                        {
                            if (e.BytesRecorded > 0) writer.Write(e.Buffer, 0, e.BytesRecorded);
                        }
                        catch (Exception ex) { failure = ex; stopped.Set(); }
                    };
                    capture.RecordingStopped += (sender, e) => { stopped.Set(); };

                    capture.StartRecording();
                    Console.WriteLine("recording started: " + capture.WaveFormat.SampleRate + "Hz " +
                        capture.WaveFormat.Channels + "ch -> " + output);

                    var deadline = DateTime.UtcNow.AddMilliseconds(maxMs);
                    while (DateTime.UtcNow < deadline && !stopped.IsSet)
                    {
                        if (stopFile != null && File.Exists(stopFile)) break;
                        Thread.Sleep(150);
                    }

                    capture.StopRecording();
                    stopped.Wait(3000);
                    writer.Flush();

                    if (failure != null) { Console.Error.WriteLine(failure.GetType().Name + ": " + failure.Message); return 6; }

                    writer.Dispose();
                    Normalize(devicePath, output);
                    try { File.Delete(devicePath); } catch { }
                    long bytes = new FileInfo(output).Length;
                    Console.WriteLine("recorded 24kHz stereo, " + bytes + " bytes -> " + output);
                    return 0;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.GetType().Name + ": " + ex.Message);
                return 5;
            }
        }

        /// Resample/convert the device-format capture into 24 kHz stereo 16-bit PCM.
        static void Normalize(string source, string destination)
        {
            using (var reader = new WaveFileReader(source))
            {
                ISampleProvider samples = reader.ToSampleProvider();
                if (samples.WaveFormat.Channels == 1)
                    samples = new MonoToStereoSampleProvider(samples);
                ISampleProvider resampled = samples.WaveFormat.SampleRate == 24000
                    ? samples
                    : new WdlResamplingSampleProvider(samples, 24000);
                WaveFileWriter.CreateWaveFile16(destination, resampled);
            }
        }
    }
}
