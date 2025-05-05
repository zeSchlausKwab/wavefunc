import React, { useState, useEffect, useRef } from 'react'
import { Input } from '@wavefunc/ui/components/ui/input'
import { ImageIcon, AlertCircle } from 'lucide-react'

interface ImageUrlInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  description?: string
  className?: string
  error?: string
}

export function ImageUrlInput({
  value,
  onChange,
  placeholder = 'https://example.com/image.jpg',
  label,
  description,
  className = '',
  error
}: ImageUrlInputProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isValidImage, setIsValidImage] = useState<boolean>(true)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) {
      setIsLoading(true)
      setPreviewUrl(value)
    } else {
      setPreviewUrl('')
      setIsValidImage(true)
      setIsLoading(false)
    }
  }, [value])

  const handleImageLoad = () => {
    setIsValidImage(true)
    setIsLoading(false)
  }

  const handleImageError = () => {
    setIsValidImage(false)
    setIsLoading(false)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <div className="text-sm font-medium">{label}</div>}
      
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={error ? 'border-destructive' : ''}
        />
      </div>
      
      {error && (
        <div className="flex items-center text-destructive text-sm mt-1">
          <AlertCircle className="h-3 w-3 mr-1" />
          <span>{error}</span>
        </div>
      )}
      
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      
      {value && (
        <div 
          ref={previewRef}
          className="relative mt-2 rounded-md overflow-hidden border bg-muted/20"
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          )}
          
          {!isValidImage && value && (
            <div className="p-3 text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              <span>Invalid image URL</span>
            </div>
          )}
          
          {value && (
            <img
              src={previewUrl}
              alt="Preview"
              className={`max-h-32 object-contain w-full ${isValidImage ? '' : 'hidden'}`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
        </div>
      )}
    </div>
  )
} 