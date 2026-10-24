package ikvmcraft.smoke;

import net.fabricmc.api.ClientModInitializer;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;

/** A test-only Fabric client entrypoint. Does not modify game content. */
public final class SmokeClient implements ClientModInitializer {
    public void onInitializeClient() {
        System.out.println("[IKVMcraft smoke] CLIENT_ENTRYPOINT_OK");
        try {
            Files.write(Paths.get("ikvmcraft-smoke-test.txt"),
                "Fabric client entrypoint executed through IKVM.\n".getBytes(StandardCharsets.UTF_8));
            System.out.println("[IKVMcraft smoke] FILE_WRITE_OK");
        } catch (Exception e) {
            System.err.println("[IKVMcraft smoke] FILE_WRITE_FAILED");
            e.printStackTrace();
        }
        Thread probe = new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("https://meta.fabricmc.net/v2/versions/loader/1.16.5/0.19.5/profile/json").openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                int status = connection.getResponseCode();
                System.out.println("[IKVMcraft smoke] HTTPS_STATUS=" + status);
                if (status != 200) throw new java.io.IOException("Unexpected HTTP status " + status);
                try (java.io.InputStream in = connection.getInputStream()) {
                    if (in.read() < 0) throw new java.io.IOException("Empty response");
                }
                System.out.println("[IKVMcraft smoke] HTTPS_BODY_OK");
            } catch (Exception e) {
                System.err.println("[IKVMcraft smoke] HTTPS_FAILED");
                e.printStackTrace();
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "ikvmcraft-smoke-network");
        probe.setDaemon(true);
        probe.start();
    }
}
