import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@wavefunc/ui/components/ui/sheet'
import { Trash, X, AlertCircle } from 'lucide-react'
import {
    type FavoritesList,
    type FavoritesListContent,
    publishFavoritesList,
    updateFavoritesList,
    deleteFavoritesList,
} from '@wavefunc/common'
import { Textarea } from '@wavefunc/ui/components/ui/textarea'
import { z } from 'zod'
import { ndkActions } from '@wavefunc/common'

const FavoritesListSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
})

type FavoritesListFormData = z.infer<typeof FavoritesListSchema>

interface EditFavoritesListDrawerProps {
    favoritesList?: FavoritesList
    isOpen: boolean
    onClose: () => void
}

export function EditFavoritesListDrawer({ favoritesList, isOpen, onClose }: EditFavoritesListDrawerProps) {
    const [isDeleting, setIsDeleting] = React.useState(false)
    const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false)
    const [isSaving, setIsSaving] = React.useState(false)
    const [deleteError, setDeleteError] = React.useState<string | null>(null)

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FavoritesListFormData>({
        resolver: zodResolver(FavoritesListSchema),
        defaultValues: favoritesList
            ? {
                  name: favoritesList.name,
                  description: favoritesList.description,
              }
            : {
                  name: '',
                  description: '',
              },
    })

    React.useEffect(() => {
        if (favoritesList) {
            reset({
                name: favoritesList.name,
                description: favoritesList.description,
            })
        } else {
            reset({
                name: '',
                description: '',
            })
        }

        // Reset states when drawer opens/closes
        setDeleteError(null)
        setIsConfirmingDelete(false)
        setIsDeleting(false)
    }, [favoritesList, reset, isOpen])

    const onSubmit = async (data: FavoritesListFormData) => {
        try {
            setIsSaving(true)
            const ndk = ndkActions.getNDK()
            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            if (favoritesList) {
                // Update existing favorites list
                await updateFavoritesList(
                    ndk,
                    favoritesList,
                    {
                        name: data.name,
                        description: data.description || '',
                    },
                    favoritesList.favorites,
                )
            } else {
                // Create new favorites list
                const content: FavoritesListContent = {
                    name: data.name,
                    description: data.description || '',
                }

                await publishFavoritesList(ndk, content, [])
            }

            onClose()
        } catch (error) {
            console.error('Error saving favorites list:', error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteFavoritesList = async () => {
        if (!favoritesList) return

        try {
            setIsDeleting(true)
            setDeleteError(null)

            const ndk = ndkActions.getNDK()
            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            console.log('Deleting favorites list with ID:', favoritesList.id)
            await deleteFavoritesList(ndk, favoritesList.id)
            console.log('Favorites list deleted successfully')
            onClose()
        } catch (error) {
            console.error('Error deleting favorites list:', error)
            setDeleteError(error instanceof Error ? error.message : 'Failed to delete the favorites list')
            setIsDeleting(false) // Reset the deleting state on error
        }
    }

    const showDeleteConfirmation = () => {
        setIsConfirmingDelete(true)
    }

    const cancelDeleteConfirmation = () => {
        setIsConfirmingDelete(false)
        setDeleteError(null)
    }

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-[90vw] sm:max-w-[540px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-primary text-lg font-press-start-2p">
                        {favoritesList ? 'Edit Favorites List' : 'Create Favorites List'}
                    </SheetTitle>
                    <SheetDescription className="font-press-start-2p text-xs">
                        {favoritesList
                            ? 'Make changes to your favorites list here.'
                            : 'Create a new favorites list to organize your stations.'}
                    </SheetDescription>
                </SheetHeader>

                {isConfirmingDelete ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center space-x-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            <h3 className="font-semibold">Are you sure you want to delete this favorites list?</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            This action cannot be undone. The favorites list will be permanently deleted.
                        </p>

                        {deleteError && (
                            <div className="p-3 bg-destructive/10 text-destructive rounded-md">{deleteError}</div>
                        )}

                        <div className="flex space-x-2 mt-6">
                            <Button
                                variant="destructive"
                                onClick={handleDeleteFavoritesList}
                                className="mr-2"
                                disabled={isDeleting}
                            >
                                <Trash className="h-4 w-4 mr-2" />
                                {isDeleting ? 'Deleting...' : 'Yes, Delete List'}
                            </Button>
                            <Button variant="outline" onClick={cancelDeleteConfirmation} disabled={isDeleting}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">List Name</Label>
                            <Input id="name" {...register('name')} />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                {...register('description')}
                                placeholder="Describe your favorites list"
                            />
                        </div>

                        {favoritesList && (
                            <div className="space-y-2">
                                <Label>Favorites</Label>
                                <div className="text-sm text-muted-foreground">
                                    {favoritesList.favorites.length > 0
                                        ? `This list contains ${favoritesList.favorites.length} stations`
                                        : 'This list is empty'}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between space-x-2">
                            <Button type="submit" className="bg-primary text-white" disabled={isSaving}>
                                {isSaving ? 'Saving...' : favoritesList ? 'Save Changes' : 'Create List'}
                            </Button>
                            <div className="flex space-x-2">
                                {favoritesList && (
                                    <Button
                                        type="button"
                                        onClick={showDeleteConfirmation}
                                        variant="destructive"
                                        className="flex items-center"
                                        disabled={isSaving}
                                    >
                                        <Trash className="h-4 w-4 mr-2" />
                                        Delete
                                    </Button>
                                )}
                                <Button type="button" onClick={onClose} variant="outline">
                                    <X className="h-4 w-4 mr-2" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </SheetContent>
        </Sheet>
    )
}
