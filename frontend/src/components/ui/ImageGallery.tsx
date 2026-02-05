import clsx from "clsx";
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ImageGalleryProps {
  images: string[]
  className?: string
}

export const ImageGallery = ({ images, className }: ImageGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState<number | null>(null)

  if (!images || images.length === 0) return null

  const gridCols = images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <>
      {/* Gallery grid */}
      <div className={clsx(
        `grid ${gridCols} gap-2 mb-6`,
        className,
      )}>
        {images.map((img, index) => (
          <motion.div
            key={index}
            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-[var(--bg-secondary)]"
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedImage(index)}
          >
            <img
              src={img}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/90"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Image */}
            <motion.img
              src={images[selectedImage]}
              alt=""
              className="relative max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            />

            {/* Close button */}
            <motion.button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
              onClick={() => setSelectedImage(null)}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </motion.button>

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                {selectedImage > 0 && (
                  <motion.button
                    className="absolute left-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedImage(prev => (prev !== null ? prev - 1 : 0))
                    }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </motion.button>
                )}
                {selectedImage < images.length - 1 && (
                  <motion.button
                    className="absolute right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedImage(prev => (prev !== null ? prev + 1 : 0))
                    }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </motion.button>
                )}
              </>
            )}

            {/* Image counter */}
            {images.length > 1 && (
              <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
              >
                {selectedImage + 1} / {images.length}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}


