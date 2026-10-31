package io.github.bearbabybaby_ai.bearbao;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/** 發票 QR 掃描：使用 Google 內建掃描畫面（自動對焦、自動放大） */
@CapacitorPlugin(name = "BearScan")
public class BearScanPlugin extends Plugin {
    @PluginMethod
    public void scan(final PluginCall call) {
        try {
            GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
            GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
            scanner.startScan()
                .addOnSuccessListener(b -> {
                    JSObject r = new JSObject();
                    r.put("text", b.getRawValue() == null ? "" : b.getRawValue());
                    call.resolve(r);
                })
                .addOnCanceledListener(() -> call.reject("已取消"))
                .addOnFailureListener(e -> call.reject("掃描無法使用：" + e.getMessage()));
        } catch (Exception e) {
            call.reject("掃描無法使用：" + e.getMessage());
        }
    }
}
