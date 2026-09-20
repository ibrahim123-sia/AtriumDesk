import express from 'express'
import {
  registerUser,
  verifyOtp,
  resentOtp,
  forgetPassword,
  resetPassword,
  loginUser,
  getUser,
  updateProfile,
  updateProfileDetails,
  parseCv,
  changePassword,
  otpLimiter,
  loginLimiter,
  unsubscribeFromDigest,
} from '../controllers/userController.js'
import { protect } from '../middlewares/auth.js'
import { avatarUpload, cvUpload, handleUploadError } from '../middlewares/upload.js'

const userRouter = express.Router()

// Rate limiter attached (Rev 6 finding #2 — otpLimiter was defined but never
// wired onto any route).
userRouter.post('/resend-otp', otpLimiter, resentOtp)
userRouter.post('/forgot-password', otpLimiter, forgetPassword)

// Public routes
// registerUser sends an OTP email on every call for a new/unverified
// address, same as resend-otp/forgot-password above — without this it was
// the one OTP-sending endpoint with no platform-side throttle, letting an
// attacker email-bomb arbitrary addresses or exhaust a tenant's SMTP quota.
userRouter.post('/register', otpLimiter, registerUser)
userRouter.post('/verify-otp', verifyOtp)
userRouter.post('/reset-password', resetPassword)
userRouter.post('/login', loginLimiter, loginUser)
userRouter.get('/unsubscribe', unsubscribeFromDigest)

// Protected routes
userRouter.get('/get', protect, getUser)
userRouter.patch(
  '/profile',
  protect,
  avatarUpload.single('avatar'),
  handleUploadError,
  updateProfile
)
userRouter.patch('/profile/details', protect, updateProfileDetails)
userRouter.post('/cv/parse', protect, cvUpload.single('cv'), handleUploadError, parseCv)
userRouter.post('/change-password', protect, changePassword)

export default userRouter