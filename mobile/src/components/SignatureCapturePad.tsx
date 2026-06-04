import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Signature from "react-native-signature-canvas";

/** Prevent parent ScrollView from stealing vertical pans while drawing. */
export const SIGNATURE_PAD_WEB_STYLE = `
  .m-signature-pad {
    box-shadow: none;
    border: none;
    margin: 0;
    touch-action: none;
  }
  .m-signature-pad--body {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .m-signature-pad--footer {
    display: none;
    margin: 0;
  }
  body, html {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    touch-action: none;
    overscroll-behavior: none;
  }
  canvas {
    border: none;
    touch-action: none;
  }
`;

export type SignatureCapturePadRef = {
  readSignature: () => void;
  clearSignature: () => void;
};

type SignatureCapturePadProps = {
  padKey?: string | number;
  onOK: (signature: string) => void;
  onEmpty?: () => void;
  onClear?: () => void;
  onEnd?: () => void;
  onBegin?: () => void;
  /** Fired when the user touches the pad — use to disable parent scroll. */
  onDrawingStart?: () => void;
  /** Fired when the stroke ends — use to re-enable parent scroll. */
  onDrawingEnd?: () => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
};

export const SignatureCapturePad = forwardRef<SignatureCapturePadRef, SignatureCapturePadProps>(
  function SignatureCapturePad(
    {
      padKey = "default",
      onOK,
      onEmpty,
      onClear,
      onEnd,
      onBegin,
      onDrawingStart,
      onDrawingEnd,
      style,
      height = 200,
    },
    ref,
  ) {
    const innerRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      readSignature: () => innerRef.current?.readSignature?.(),
      clearSignature: () => innerRef.current?.clearSignature?.(),
    }));

    const handleDrawingStart = () => {
      onBegin?.();
      onDrawingStart?.();
    };

    const handleDrawingEnd = () => {
      onEnd?.();
      onDrawingEnd?.();
    };

    return (
      <View
        style={[styles.wrap, { height }, style]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleDrawingStart}
        onResponderRelease={handleDrawingEnd}
      >
        <Signature
          key={`signature-pad-${padKey}`}
          ref={innerRef}
          onOK={onOK}
          onEmpty={onEmpty}
          onClear={onClear}
          onBegin={handleDrawingStart}
          onEnd={handleDrawingEnd}
          webStyle={SIGNATURE_PAD_WEB_STYLE}
          autoClear={false}
          imageType="image/png"
          descriptionText=""
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
});
