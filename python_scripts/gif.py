import os
import imageio.v2 as imageio
import logging
import sys

def downLoadGif(file_path="."):
    
    # 检查目录是否存在
    if not os.path.exists(file_path):
        logging.error(f"Directory {file_path} does not exist!")
        return
    
    # 获取目录中的所有文件
    all_files = os.listdir(file_path)
    
    # 过滤出文件（排除子目录），并构建完整路径
    temp_file_list = [
        os.path.join(file_path, filename) 
        for filename in all_files 
        if os.path.isfile(os.path.join(file_path, filename))
    ]
    
    # 按文件名排序（确保顺序正确）
    temp_file_list.sort()
    
    logging.info(f"Found {len(temp_file_list)} files: {temp_file_list}")
    
    # 如果没有找到文件，直接返回
    if not temp_file_list:
        logging.error("No files found to create GIF!")
        return
    
    image_data = []
    for file in temp_file_list:
        try:
            image_data.append(imageio.imread(file))
        except Exception as e:
            logging.error(f"Error reading file {file}: {e}")
    
    # 如果有图片数据，则创建GIF
    if image_data:
        output_path = os.path.join(file_path, "../output.gif")
        imageio.mimsave(output_path, image_data, "GIF", duration=1)
        logging.info(f"GIF saved to {output_path}")
        
        # 删除原文件
        for file in temp_file_list:
            try:
                os.remove(file)
                logging.info(f"Deleted {file}")
            except Exception as e:
                logging.error(f"Error deleting file {file}: {e}")
    else:
        logging.error("No valid image files found!")

if __name__ == "__main__":
    # 从命令行参数获取 file_path，如果没有参数则使用默认值 '.'
    file_path = sys.argv[1] if len(sys.argv) > 1 else "."
    downLoadGif(file_path)
    print("GIF generated successfully!")