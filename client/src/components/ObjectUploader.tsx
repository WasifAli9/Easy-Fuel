// Reference: blueprint:javascript_object_storage
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

// Global state to ensure only one modal is open at a time
let globalModalOpen = false;
let currentOpenInstance: string | null = null;
const modalListeners = new Set<() => void>();

function notifyModalStateChange() {
  modalListeners.forEach(listener => listener());
}

function closeAllUppyModals() {
  // Close all Uppy dashboard modals by finding and closing them
  const uppyModals = document.querySelectorAll('.uppy-Dashboard-modal');
  uppyModals.forEach((modal) => {
    const closeButton = modal.querySelector('[aria-label="Close modal"], [aria-label="Close"], .uppy-Dashboard-close') as HTMLElement;
    if (closeButton) {
      closeButton.click();
    } else {
      // Fallback: hide the modal directly
      (modal as HTMLElement).style.display = 'none';
    }
  });
  
  // Also try to close via Uppy's internal state by hiding overlay
  const uppyOverlays = document.querySelectorAll('.uppy-Dashboard-overlay');
  uppyOverlays.forEach((overlay) => {
    (overlay as HTMLElement).style.display = 'none';
  });
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  allowedFileTypes,
  onGetUploadParameters,
  onComplete,
  buttonVariant = "default",
  buttonSize = "default",
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const uppyRef = useRef<Uppy | null>(null);
  const instanceIdRef = useRef<string>(Math.random().toString(36).substring(7));
  const isMountedRef = useRef(true);
  
  // Listen for global modal state changes
  useEffect(() => {
    const listener = () => {
      if (globalModalOpen && currentOpenInstance !== instanceIdRef.current && isMountedRef.current) {
        // Another modal is open, force close this one
        setShowModal(false);
        if (uppyRef.current) {
          uppyRef.current.cancelAll();
        }
      }
    };
    modalListeners.add(listener);
    return () => {
      modalListeners.delete(listener);
    };
  }, []);
  
  // Manage modal state and ensure only one is open
  useEffect(() => {
    if (showModal) {
      // Close all other modals first
      if (globalModalOpen && currentOpenInstance !== instanceIdRef.current) {
        closeAllUppyModals();
        // Notify other instances to close
        notifyModalStateChange();
      }
      
      // Set this instance as the current open one
      globalModalOpen = true;
      currentOpenInstance = instanceIdRef.current;
      notifyModalStateChange();
      
      // Cleanup function
      return () => {
        if (currentOpenInstance === instanceIdRef.current) {
          globalModalOpen = false;
          currentOpenInstance = null;
          notifyModalStateChange();
        }
      };
    } else {
      // When closing, reset global state if this was the open instance
      if (currentOpenInstance === instanceIdRef.current) {
        globalModalOpen = false;
        currentOpenInstance = null;
        notifyModalStateChange();
      }
    }
  }, [showModal]);
  
  // Initialize Uppy instance only once per component
  useEffect(() => {
    if (!uppyRef.current) {
      uppyRef.current = new Uppy({
        id: `uppy-${instanceIdRef.current}`,
        restrictions: {
          maxNumberOfFiles,
          maxFileSize,
          allowedFileTypes,
        },
        autoProceed: false,
      })
        .use(AwsS3, {
          shouldUseMultipart: false,
          getUploadParameters: async (file) => {
            const params = await onGetUploadParameters();
            // Convert relative URLs to absolute URLs for Uppy
            let url = params.url;
            if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
              // If it's a relative URL, make it absolute
              if (url.startsWith('/')) {
                url = window.location.origin + url;
              } else {
                url = window.location.origin + '/' + url;
              }
            }
            return { method: params.method, url };
          },
        })
        .on("complete", (result) => {
          onComplete?.(result);
          // Clear files after completion
          uppyRef.current?.cancelAll();
          setShowModal(false);
        })
        .on("upload-error", (file, error, response) => {
          console.error("Uppy upload error:", { file, error, response });
        })
        .on("upload", (data) => {
          console.log("Uppy upload started:", data);
        });
    }

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (uppyRef.current) {
        uppyRef.current.cancelAll();
        // Close modal by setting state
        setShowModal(false);
        uppyRef.current = null;
      }
      if (currentOpenInstance === instanceIdRef.current) {
        globalModalOpen = false;
        currentOpenInstance = null;
      }
    };
  }, []);

  const handleClose = () => {
    try {
      // Clear files when closing
      if (uppyRef.current) {
        try {
          uppyRef.current.cancelAll();
        } catch (error) {
          console.warn("Error canceling uploads on close:", error);
        }
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error closing upload modal:", error);
      // Force close even if there's an error
      setShowModal(false);
    }
  };

  const handleOpen = (e: React.MouseEvent) => {
    try {
      e.stopPropagation();
      e.preventDefault();
      
      // Prevent opening if another modal is already open
      if (globalModalOpen && currentOpenInstance !== instanceIdRef.current) {
        return;
      }
      
      // Ensure Uppy instance exists
      if (!uppyRef.current) {
        console.error("Uppy instance not initialized");
        return;
      }
      
      // Close any other open modals
      if (globalModalOpen) {
        try {
          closeAllUppyModals();
        } catch (error) {
          console.warn("Error closing other modals:", error);
        }
        notifyModalStateChange();
      }
      
      // Set this instance as the current open one BEFORE setting showModal
      // This ensures the modal opens immediately
      globalModalOpen = true;
      currentOpenInstance = instanceIdRef.current;
      
      // Clear any existing files
      try {
        uppyRef.current.cancelAll();
      } catch (error) {
        console.warn("Error canceling uploads:", error);
      }
      
      // Now set showModal to true - this will trigger the useEffect
      setShowModal(true);
    } catch (error) {
      console.error("Error opening upload modal:", error);
      // Don't crash the page, just log the error
    }
  };

  return (
    <div data-uppy-instance={instanceIdRef.current}>
      <Button 
        onClick={handleOpen}
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        data-testid="button-upload"
        type="button"
      >
        {children}
      </Button>

      {uppyRef.current && (
        <DashboardModal
          key={`modal-${instanceIdRef.current}`}
          uppy={uppyRef.current}
          open={showModal}
          onRequestClose={handleClose}
          proudlyDisplayPoweredByUppy={false}
          closeModalOnClickOutside={true}
          closeModalOnEscape={true}
          animateOpenClose={true}
        />
      )}
    </div>
  );
}
