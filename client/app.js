class PhotoboothApp {
    constructor() {
        this.socket = null;
        this.isCapturing = false;
        this.isConnected = false;
        this.previewInterval = null;
        this.recentPhotos = [];
        this.init();
    }

    init() {
        this.connectSocket();
        this.setupEventListeners();
        this.checkDeviceStatus();
        this.startPreview();
    }

    connectSocket() {
        const port = 3112; // Match the port in .env
        const serverUrl = window.location.hostname === 'localhost' 
            ? `http://localhost:${port}` 
            : `http://${window.location.hostname}:${port}`;
        
        this.socket = io(serverUrl);

        this.socket.on('connect', () => {
            console.log('Connected to photobooth server');
            this.updateConnectionStatus('connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
        });
        
        this.socket.on('camera-status', (status) => {
            this.updateCameraStatus(status);
        });

        this.socket.on('preview-frame', (data) => {
            this.updatePreview(data);
        });

        this.socket.on('capture-started', () => {
            this.onCaptureStarted();
        });
        
        this.socket.on('capture-preparing', () => {
            this.showPreparationStatus();
        });

        this.socket.on('capture-complete', (data) => {
            this.onCaptureComplete(data);
        });

        this.socket.on('print-started', () => {
            this.showNotification('Sending to printer...');
        });

        this.socket.on('print-complete', () => {
            this.showNotification('Photo printed successfully!');
            this.isCapturing = false;
            this.updateCaptureButton();
        });

        this.socket.on('error', (error) => {
            this.showErrorToast(error.message);
            this.isCapturing = false;
            this.updateCaptureButton();
            
            // Re-prepare camera for next capture after error
            setTimeout(() => {
                if (this.isConnected) {
                    console.log('Re-preparing camera after error...');
                    this.socket.emit('prepare-capture');
                }
            }, 5000);
        });
        
        this.socket.on('print-complete', () => {
            this.showNotification('Photo printed successfully!');
            this.isCapturing = false;
            this.updateCaptureButton();
            
            // Re-prepare camera for next capture
            setTimeout(() => {
                if (this.isConnected) {
                    console.log('Re-preparing camera for next photo...');
                    this.socket.emit('prepare-capture');
                }
            }, 3000);
        });
    }

    setupEventListeners() {
        const connectBtn = document.getElementById('connect-btn');
        const captureBtn = document.getElementById('capture-btn');
        const settingsBtn = document.getElementById('settings-toggle');
        const modalClose = document.getElementById('modal-close');
        const settingsModal = document.getElementById('settings-modal');
        const errorClose = document.getElementById('error-close');
        const photoModalClose = document.getElementById('photo-modal-close');
        const printPhotoBtn = document.getElementById('print-photo-btn');
        const retakePhotoBtn = document.getElementById('retake-photo-btn');

        connectBtn.addEventListener('click', () => this.toggleCameraConnection());
        captureBtn.addEventListener('click', () => this.capturePhoto());
        
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('active');
        });

        modalClose.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });

        // Error toast close handler
        errorClose.addEventListener('click', () => {
            this.hideErrorToast();
        });

        // Photo detail modal handlers
        photoModalClose.addEventListener('click', () => {
            this.hidePhotoDetail();
        });

        printPhotoBtn.addEventListener('click', () => {
            this.printCurrentPhoto();
        });

        retakePhotoBtn.addEventListener('click', () => {
            this.retakePhoto();
        });

        document.querySelectorAll('#settings-modal select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.updateCameraSetting(e.target.id, e.target.value);
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopPreview();
            } else {
                this.startPreview();
            }
        });
    }

    toggleCameraConnection() {
        if (this.isConnected) {
            this.socket.emit('disconnect-camera');
        } else {
            this.socket.emit('connect-camera');
        }
    }
    
    updateCameraStatus(status) {
        this.isConnected = status.connected;
        const connectBtn = document.getElementById('connect-btn');
        const captureBtn = document.getElementById('capture-btn');
        const previewMessage = document.getElementById('preview-message');
        
        if (status.connected) {
            connectBtn.classList.add('connected');
            connectBtn.querySelector('span').textContent = 'Disconnect Camera';
            captureBtn.style.display = 'flex';
            
            // Remove the preview message when connected
            if (previewMessage) {
                previewMessage.remove();
            }
            
            // Start preparing camera immediately when connected and ready
            setTimeout(() => {
                console.log('Pre-warming camera for faster capture...');
                this.socket.emit('prepare-capture');
            }, 2000); // Give the stream time to fully start
            
        } else {
            connectBtn.classList.remove('connected');
            connectBtn.querySelector('span').textContent = 'Connect to Camera';
            captureBtn.style.display = 'none';
            
            // Show connection message
            this.showConnectionMessage(status.message);
        }
        
        this.updateDeviceStatus('camera', status.connected);
    }
    
    showConnectionMessage(message) {
        const previewImage = document.getElementById('preview-image');
        const previewFrame = document.getElementById('preview-frame');
        const existingMessage = document.getElementById('preview-message');
        
        previewImage.style.display = 'none';
        
        if (!existingMessage) {
            const messageDiv = document.createElement('div');
            messageDiv.id = 'preview-message';
            messageDiv.innerHTML = `
                <div style="text-align: center;">
                    <svg viewBox="0 0 100 100" style="width: 100px; height: 100px; margin-bottom: 20px;">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#4ecdc4" stroke-width="3"/>
                        <circle cx="50" cy="50" r="35" fill="#4ecdc4"/>
                        <rect x="35" y="25" width="30" height="25" fill="white" rx="2"/>
                        <circle cx="50" cy="37.5" r="8" fill="#4ecdc4"/>
                    </svg>
                    <h2>Canon EOS M50</h2>
                    <p>${message}</p>
                </div>
            `;
            previewFrame.appendChild(messageDiv);
        } else {
            existingMessage.querySelector('p').textContent = message;
        }
    }
    
    startPreview() {
        // Preview is now handled by the server's video stream
        // This method is kept for compatibility
    }

    stopPreview() {
        if (this.previewInterval) {
            clearInterval(this.previewInterval);
            this.previewInterval = null;
        }
    }

    requestPreview() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('request-preview');
        }
    }

    updatePreview(data) {
        const previewImage = document.getElementById('preview-image');
        const previewMessage = document.getElementById('preview-message');
        
        if (data && data.data) {
            // We have live video frame!
            previewImage.style.display = 'block';
            previewImage.src = `data:${data.mimeType};base64,${data.data}`;
            
            // Hide the message if it exists
            if (previewMessage) {
                previewMessage.remove();
            }
        } else if (!previewMessage) {
            // No preview data, show ready message
            previewImage.style.display = 'none';
            const previewFrame = document.getElementById('preview-frame');
            const message = document.createElement('div');
            message.id = 'preview-message';
            message.innerHTML = `
                <div style="text-align: center;">
                    <h2>Canon EOS M50</h2>
                    <p>Initializing live preview...</p>
                </div>
            `;
            previewFrame.appendChild(message);
        }
    }

    async capturePhoto() {
        if (this.isCapturing) return;
        
        this.isCapturing = true;
        this.updateCaptureButton();
        
        // Show countdown immediately - preparation already started when button appeared
        await this.showCountdown();
        
        // Send final capture command
        this.socket.emit('execute-capture');
    }

    showPreparationStatus() {
        const overlay = document.getElementById('preview-overlay');
        const countdown = document.getElementById('countdown');
        
        overlay.classList.add('active');
        countdown.textContent = 'Preparing...';
        countdown.style.animation = 'pulse 1s infinite';
    }

    async showCountdown() {
        const overlay = document.getElementById('preview-overlay');
        const countdown = document.getElementById('countdown');
        
        overlay.classList.add('active');
        
        for (let i = 3; i > 0; i--) {
            countdown.textContent = i;
            countdown.style.animation = 'none';
            setTimeout(() => {
                countdown.style.animation = 'countdownPulse 1s ease-in-out';
            }, 10);
            await this.sleep(1000);
        }
        
        countdown.textContent = 'Smile!';
        await this.sleep(500);
        
        overlay.classList.remove('active');
    }

    onCaptureStarted() {
        const overlay = document.getElementById('preview-overlay');
        overlay.style.background = 'white';
        overlay.classList.add('active');
        
        setTimeout(() => {
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.classList.remove('active');
        }, 200);
    }

    onCaptureComplete(data) {
        this.showNotification('Photo captured!');
        this.addRecentPhoto(data.path);
        this.showPhotoDetail(data.path);
    }

    addRecentPhoto(photoPath) {
        this.recentPhotos.unshift(photoPath);
        if (this.recentPhotos.length > 9) {
            this.recentPhotos = this.recentPhotos.slice(0, 9);
        }
        this.updatePhotoGrid();
    }

    updatePhotoGrid() {
        const grid = document.getElementById('photo-grid');
        grid.innerHTML = '';
        
        this.recentPhotos.forEach((photo, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'photo-thumbnail';
            thumbnail.innerHTML = `<img src="/captures/${photo.split('/').pop()}" alt="Photo ${index + 1}">`;
            thumbnail.addEventListener('click', () => {
                this.showPhotoDetail(photo);
            });
            grid.appendChild(thumbnail);
        });
    }

    updateCaptureButton() {
        const btn = document.getElementById('capture-btn');
        if (this.isCapturing) {
            btn.classList.add('capturing');
            btn.querySelector('span').textContent = 'Capturing...';
        } else {
            btn.classList.remove('capturing');
            btn.querySelector('span').textContent = 'Take Photo';
        }
    }

    async checkDeviceStatus() {
        try {
            const cameraResponse = await fetch('/camera/status');
            const cameraStatus = await cameraResponse.json();
            this.updateDeviceStatus('camera', cameraStatus.connected);

            const printerResponse = await fetch('/printer/status');
            const printerStatus = await printerResponse.json();
            this.updateDeviceStatus('printer', printerStatus.connected);
        } catch (error) {
            console.error('Error checking device status:', error);
        }
        
        setTimeout(() => this.checkDeviceStatus(), 5000);
    }

    updateDeviceStatus(device, isConnected) {
        const statusElement = document.getElementById(`${device}-status`);
        if (isConnected) {
            statusElement.classList.add('connected');
        } else {
            statusElement.classList.remove('connected');
        }
    }

    updateConnectionStatus(status) {
        if (status === 'connected') {
            this.showNotification('Connected to server');
        } else {
            this.showError('Disconnected from server');
        }
    }

    updateCameraSetting(setting, value) {
        console.log(`Updating ${setting} to ${value}`);
    }

    showNotification(message) {
        console.log('Notification:', message);
    }

    showErrorToast(message) {
        console.error('Error:', message);
        const toast = document.getElementById('error-toast');
        const messageElement = document.getElementById('error-message');
        
        messageElement.textContent = message;
        toast.classList.add('show');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideErrorToast();
        }, 5000);
    }

    hideErrorToast() {
        const toast = document.getElementById('error-toast');
        toast.classList.remove('show');
    }

    showPhotoDetail(photoPath) {
        const modal = document.getElementById('photo-detail-modal');
        const image = document.getElementById('detail-image');
        
        // Store current photo for printing
        this.currentPhotoPath = photoPath;
        
        // Set image source
        const filename = photoPath.split('/').pop();
        image.src = `/captures/${filename}`;
        
        // Show modal
        modal.classList.add('active');
    }

    hidePhotoDetail() {
        const modal = document.getElementById('photo-detail-modal');
        modal.classList.remove('active');
        this.currentPhotoPath = null;
    }

    printCurrentPhoto() {
        if (this.currentPhotoPath && this.socket) {
            this.socket.emit('print-photo', { path: this.currentPhotoPath });
            this.hidePhotoDetail();
            this.showNotification('Sending to printer...');
        }
    }

    retakePhoto() {
        this.hidePhotoDetail();
        // Remove the last photo from recent photos if it was just captured
        if (this.currentPhotoPath && this.recentPhotos.length > 0) {
            const lastPhoto = this.recentPhotos[0];
            if (lastPhoto === this.currentPhotoPath) {
                this.recentPhotos.shift();
                this.updatePhotoGrid();
            }
        }
        // Trigger new capture
        this.capturePhoto();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PhotoboothApp();
});